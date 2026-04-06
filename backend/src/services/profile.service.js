const { z } = require('zod');
const { query, withTransaction } = require('../config/database');

const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().email().max(255).nullable().optional(),
  studentProfile: z.object({
    universityName: z.string().trim().max(160).nullable().optional(),
    courseName: z.string().trim().max(160).nullable().optional(),
    yearOfStudy: z.number().int().min(1).max(8).nullable().optional(),
    budgetMin: z.number().nonnegative().nullable().optional(),
    budgetMax: z.number().nonnegative().nullable().optional(),
    preferredGender: z.string().trim().max(20).nullable().optional()
  }).optional(),
  landlordProfile: z.object({
    businessName: z.string().trim().max(160).nullable().optional()
  }).optional()
});

async function getMyProfile(userId) {
  const userResult = await query(
    `
    SELECT id, role, full_name, phone, email, is_phone_verified, is_email_verified, created_at, updated_at
    FROM users
    WHERE id = $1
    `,
    [userId]
  );

  const user = userResult.rows[0];

  if (!user) {
    return null;
  }

  let roleProfile = null;

  if (user.role === 'student') {
    const studentResult = await query(
      `
      SELECT university_name, course_name, year_of_study, budget_min, budget_max, preferred_gender
      FROM students
      WHERE user_id = $1
      `,
      [userId]
    );
    roleProfile = studentResult.rows[0] || {};
  }

  if (user.role === 'landlord') {
    const landlordResult = await query(
      `
      SELECT business_name, verification_status, avg_rating, total_listings
      FROM landlords
      WHERE user_id = $1
      `,
      [userId]
    );
    roleProfile = landlordResult.rows[0] || {};
  }

  return {
    id: user.id,
    role: user.role,
    fullName: user.full_name,
    phone: user.phone,
    email: user.email,
    isPhoneVerified: user.is_phone_verified,
    isEmailVerified: user.is_email_verified,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
    roleProfile
  };
}

async function updateMyProfile(userId, payload) {
  const data = updateProfileSchema.parse(payload);

  await withTransaction(async (client) => {
    if (data.fullName !== undefined || data.email !== undefined) {
      const nextFullName = data.fullName === undefined ? null : data.fullName;
      const nextEmail = data.email === undefined ? null : data.email;
      await client.query(
        `
        UPDATE users
        SET full_name = COALESCE($2, full_name),
            email = COALESCE($3, email)
        WHERE id = $1
        `,
        [userId, nextFullName, nextEmail]
      );
    }

    const roleResult = await client.query('SELECT role FROM users WHERE id = $1', [userId]);
    const role = roleResult.rows[0]?.role;

    if (role === 'student' && data.studentProfile) {
      await client.query(
        `
        UPDATE students
        SET university_name = COALESCE($2, university_name),
            course_name = COALESCE($3, course_name),
            year_of_study = COALESCE($4, year_of_study),
            budget_min = COALESCE($5, budget_min),
            budget_max = COALESCE($6, budget_max),
            preferred_gender = COALESCE($7, preferred_gender)
        WHERE user_id = $1
        `,
        [
          userId,
          data.studentProfile.universityName ?? null,
          data.studentProfile.courseName ?? null,
          data.studentProfile.yearOfStudy ?? null,
          data.studentProfile.budgetMin ?? null,
          data.studentProfile.budgetMax ?? null,
          data.studentProfile.preferredGender ?? null
        ]
      );
    }

    if (role === 'landlord' && data.landlordProfile) {
      await client.query(
        `
        UPDATE landlords
        SET business_name = COALESCE($2, business_name)
        WHERE user_id = $1
        `,
        [userId, data.landlordProfile.businessName ?? null]
      );
    }
  });

  return getMyProfile(userId);
}

module.exports = {
  getMyProfile,
  updateMyProfile
};
