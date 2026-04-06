const studentConnections = new Map();

function registerStudentConnection(studentUserId, res) {
  const key = String(studentUserId);
  if (!studentConnections.has(key)) {
    studentConnections.set(key, new Set());
  }

  const bucket = studentConnections.get(key);
  bucket.add(res);

  return () => {
    const set = studentConnections.get(key);
    if (!set) {
      return;
    }

    set.delete(res);
    if (set.size === 0) {
      studentConnections.delete(key);
    }
  };
}

function writeEvent(res, eventName, data) {
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function publishToStudent(studentUserId, eventName, payload) {
  const key = String(studentUserId);
  const set = studentConnections.get(key);
  if (!set || set.size === 0) {
    return 0;
  }

  for (const res of set) {
    writeEvent(res, eventName, payload);
  }

  return set.size;
}

module.exports = {
  registerStudentConnection,
  writeEvent,
  publishToStudent
};
