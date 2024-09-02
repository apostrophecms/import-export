const getTargetId = async ({
  manager,
  doc,
  req
}) => {
  if (doc.archived) {
    return '_archive';
  }

  const { path = '' } = doc;
  const ancestorIds = path.split('/').reverse().slice(1);
  for (const ancestorId of ancestorIds) {
    try {
      await manager.getTarget(req, ancestorId);

      return ancestorId;
    } catch (error) {
      // continue search
    }
  }

  return '_home';
};

const insert = async ({
  manager,
  doc,
  req
}) => {
  const targetId = await getTargetId({
    manager,
    doc,
    req
  });
  const position = 'lastChild';

  return manager.insert(
    req,
    targetId,
    position,
    doc,
    { setModified: false }
  );
};

const update = async ({
  manager,
  doc,
  req
}) => {
  const {
    _id,
    aposDocId,
    path,
    rank,
    level,
    ...patch
  } = doc;

  const targetId = await getTargetId({
    manager,
    doc,
    req
  });

  return manager.patch(
    req.clone({
      body: {
        ...patch,
        _targetId: targetId,
        _position: 'lastChild'
      }
    }),
    _id
  );
};

module.exports = {
  insert,
  update
};
