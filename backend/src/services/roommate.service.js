const { z } = require('zod');
const { query, withTransaction } = require('../config/database');

const roommateProfileSchema = z.object({
  sleepSchedule: z.string().trim().max(30).nullable().optional(),
  foodPreference: z.string().trim().max(30).nullable().optional(),
  smokingPreference: z.string().trim().max(20).nullable().optional(),
  studyNoisePreference: z.string().trim().max(30).nullable().optional(),
  bio: z.string().trim().max(1000).nullable().optional(),
  isOptedIn: z.boolean().optional()
});

const roommateQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  minScore: z.coerce.number().min(0).max(100).default(30)
});

function scoreCompatibility(me, other) {
  let score = 0;

  if (me.sleep_schedule && me.sleep_schedule === other.sleep_schedule) score += 20;
  if (me.food_preference && me.food_preference === other.food_preference) score += 15;
  if (me.smoking_preference && me.smoking_preference === other.smoking_preference) score += 15;
  if (me.study_noise_preference && me.study_noise_preference === other.study_noise_preference) score += 15;

  if (me.university_name && me.university_name === other.university_name) score += 10;

  const meMin = me.budget_min ? Number(me.budget_min) : null;
  const meMax = me.budget_max ? Number(me.budget_max) : null;
  const otherMin = other.budget_min ? Number(other.budget_min) : null;
  const otherMax = other.budget_max ? Number(other.budget_max) : null;

  if (meMin !== null && meMax !== null && otherMin !== null && otherMax !== null) {
    const overlap = Math.max(meMin, otherMin) <= Math.min(meMax, otherMax);
    if (overlap) {
      score += 20;
    }
  }

  if (me.preferred_gender && other.preferred_gender && me.preferred_gender.toLowerCase() === other.preferred_gender.toLowerCase()) {
    score += 5;
  }

  return Math.min(100, score);
}

function canonicalPair(a, b) {
  return a < b ? [a, b] : [b, a];
}

async function getMyRoommateProfile(studentUserId) {
  const result = await query(
    `
    SELECT
      rp.student_user_id,
      rp.sleep_schedule,
      rp.food_preference,
      rp.smoking_preference,
      rp.study_noise_preference,
      rp.bio,
      rp.is_opted_in,
      s.university_name,
      s.course_name,
      s.year_of_study,
      s.budget_min,
      s.budget_max,
      s.preferred_gender,
      u.full_name,
      u.phone,
      u.email
    FROM roommate_profiles rp
    JOIN students s ON s.user_id = rp.student_user_id
    JOIN users u ON u.id = rp.student_user_id
    WHERE rp.student_user_id = $1
    LIMIT 1
    `,
    [studentUserId]
  );

  return result.rows[0] || null;
}

async function upsertMyRoommateProfile(studentUserId, payload) {
  const data = roommateProfileSchema.parse(payload);

  await withTransaction(async (client) => {
    await client.query(
      `
      INSERT INTO roommate_profiles (
        student_user_id,
        sleep_schedule,
        food_preference,
        smoking_preference,
        study_noise_preference,
        bio,
        is_opted_in
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (student_user_id)
      DO UPDATE SET
        sleep_schedule = COALESCE($2, roommate_profiles.sleep_schedule),
        food_preference = COALESCE($3, roommate_profiles.food_preference),
        smoking_preference = COALESCE($4, roommate_profiles.smoking_preference),
        study_noise_preference = COALESCE($5, roommate_profiles.study_noise_preference),
        bio = COALESCE($6, roommate_profiles.bio),
        is_opted_in = COALESCE($7, roommate_profiles.is_opted_in)
      `,
      [
        studentUserId,
        data.sleepSchedule ?? null,
        data.foodPreference ?? null,
        data.smokingPreference ?? null,
        data.studyNoisePreference ?? null,
        data.bio ?? null,
        data.isOptedIn ?? null
      ]
    );
  });

  return getMyRoommateProfile(studentUserId);
}

async function findRoommateMatches(studentUserId, payload = {}) {
  const filters = roommateQuerySchema.parse(payload);

  const meResult = await query(
    `
    SELECT
      rp.student_user_id,
      rp.sleep_schedule,
      rp.food_preference,
      rp.smoking_preference,
      rp.study_noise_preference,
      rp.bio,
      rp.is_opted_in,
      s.university_name,
      s.course_name,
      s.year_of_study,
      s.budget_min,
      s.budget_max,
      s.preferred_gender,
      u.full_name
    FROM roommate_profiles rp
    JOIN students s ON s.user_id = rp.student_user_id
    JOIN users u ON u.id = rp.student_user_id
    WHERE rp.student_user_id = $1
    LIMIT 1
    `,
    [studentUserId]
  );

  const me = meResult.rows[0];
  if (!me || !me.is_opted_in) {
    return { items: [], note: 'Enable roommate opt-in before searching matches.' };
  }

  const peersResult = await query(
    `
    SELECT
      rp.student_user_id,
      rp.sleep_schedule,
      rp.food_preference,
      rp.smoking_preference,
      rp.study_noise_preference,
      rp.bio,
      rp.is_opted_in,
      s.university_name,
      s.course_name,
      s.year_of_study,
      s.budget_min,
      s.budget_max,
      s.preferred_gender,
      u.full_name
    FROM roommate_profiles rp
    JOIN students s ON s.user_id = rp.student_user_id
    JOIN users u ON u.id = rp.student_user_id
    WHERE rp.student_user_id <> $1
      AND rp.is_opted_in = TRUE
    `,
    [studentUserId]
  );

  const scored = peersResult.rows
    .map((peer) => ({
      studentUserId: peer.student_user_id,
      fullName: peer.full_name,
      universityName: peer.university_name,
      courseName: peer.course_name,
      yearOfStudy: peer.year_of_study,
      bio: peer.bio,
      budgetMin: peer.budget_min,
      budgetMax: peer.budget_max,
      sleepSchedule: peer.sleep_schedule,
      foodPreference: peer.food_preference,
      smokingPreference: peer.smoking_preference,
      studyNoisePreference: peer.study_noise_preference,
      compatibilityScore: scoreCompatibility(me, peer)
    }))
    .filter((item) => item.compatibilityScore >= filters.minScore)
    .sort((a, b) => b.compatibilityScore - a.compatibilityScore)
    .slice(0, filters.limit);

  await withTransaction(async (client) => {
    for (const item of scored) {
      const [a, b] = canonicalPair(studentUserId, item.studentUserId);
      await client.query(
        `
        INSERT INTO roommate_matches (student_user_id_a, student_user_id_b, compatibility_score)
        VALUES ($1, $2, $3)
        ON CONFLICT (student_user_id_a, student_user_id_b)
        DO UPDATE SET compatibility_score = EXCLUDED.compatibility_score
        `,
        [a, b, item.compatibilityScore]
      );
    }
  });

  return {
    items: scored,
    criteria: {
      minScore: filters.minScore,
      limit: filters.limit
    }
  };
}

module.exports = {
  getMyRoommateProfile,
  upsertMyRoommateProfile,
  findRoommateMatches
};
