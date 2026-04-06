const { searchListingsForStudent, getLocalityInsights } = require('../services/student-discovery.service');
const { getMyRoommateProfile, upsertMyRoommateProfile, findRoommateMatches } = require('../services/roommate.service');
const {
  createSavedSearch,
  listSavedSearches,
  updateSavedSearch,
  deleteSavedSearch,
  listStudentAlerts,
  markAlertRead,
  markAllAlertsRead
} = require('../services/saved-search-alert.service');
const { registerStudentConnection, writeEvent } = require('../services/alert-stream.service');

async function searchStudentListings(req, res, next) {
  try {
    const result = await searchListingsForStudent(req.auth.userId, req.query);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

async function localityInsights(req, res, next) {
  try {
    const result = await getLocalityInsights(req.query);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

async function getRoommateProfile(req, res, next) {
  try {
    const profile = await getMyRoommateProfile(req.auth.userId);
    return res.status(200).json({ profile });
  } catch (error) {
    return next(error);
  }
}

async function upsertRoommateProfile(req, res, next) {
  try {
    const profile = await upsertMyRoommateProfile(req.auth.userId, req.body);
    return res.status(200).json({ message: 'Roommate profile updated successfully.', profile });
  } catch (error) {
    return next(error);
  }
}

async function roommateMatches(req, res, next) {
  try {
    const result = await findRoommateMatches(req.auth.userId, req.query);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

async function createStudentSavedSearch(req, res, next) {
  try {
    const savedSearch = await createSavedSearch(req.auth.userId, req.body);
    return res.status(201).json({ message: 'Saved search created successfully.', savedSearch });
  } catch (error) {
    return next(error);
  }
}

async function getStudentSavedSearches(req, res, next) {
  try {
    const result = await listSavedSearches(req.auth.userId);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

async function updateStudentSavedSearch(req, res, next) {
  try {
    const savedSearch = await updateSavedSearch(req.auth.userId, req.params.id, req.body);
    if (!savedSearch) {
      return res.status(404).json({ message: 'Saved search not found.' });
    }

    return res.status(200).json({ message: 'Saved search updated successfully.', savedSearch });
  } catch (error) {
    return next(error);
  }
}

async function deleteStudentSavedSearch(req, res, next) {
  try {
    const deleted = await deleteSavedSearch(req.auth.userId, req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: 'Saved search not found.' });
    }

    return res.status(200).json({ message: 'Saved search deleted successfully.' });
  } catch (error) {
    return next(error);
  }
}

async function getStudentAlerts(req, res, next) {
  try {
    const result = await listStudentAlerts(req.auth.userId, req.query);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

async function markStudentAlertRead(req, res, next) {
  try {
    const updated = await markAlertRead(req.auth.userId, req.params.id);
    if (!updated) {
      return res.status(404).json({ message: 'Alert not found.' });
    }

    return res.status(200).json({ message: 'Alert marked as read.' });
  } catch (error) {
    return next(error);
  }
}

async function markStudentAlertsReadAll(req, res, next) {
  try {
    const count = await markAllAlertsRead(req.auth.userId);
    return res.status(200).json({ message: 'All alerts marked as read.', count });
  } catch (error) {
    return next(error);
  }
}

function streamStudentAlerts(req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  writeEvent(res, 'connected', {
    message: 'Student alert stream connected.',
    studentUserId: req.auth.userId,
    ts: new Date().toISOString()
  });

  const heartbeat = setInterval(() => {
    writeEvent(res, 'heartbeat', { ts: new Date().toISOString() });
  }, 25000);

  const unregister = registerStudentConnection(req.auth.userId, res);
  req.on('close', () => {
    clearInterval(heartbeat);
    unregister();
  });
}

module.exports = {
  searchStudentListings,
  localityInsights,
  getRoommateProfile,
  upsertRoommateProfile,
  roommateMatches,
  createStudentSavedSearch,
  getStudentSavedSearches,
  updateStudentSavedSearch,
  deleteStudentSavedSearch,
  getStudentAlerts,
  markStudentAlertRead,
  markStudentAlertsReadAll,
  streamStudentAlerts
};
