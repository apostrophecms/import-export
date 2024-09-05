const getTargetId = async ({
  manager,
  doc,
  req,
  duplicatedDocs = []
}) => {
  if (doc.archived) {
    return '_archive';
  }

  const duplicatedDocsMapping = Object.fromEntries(
    duplicatedDocs.map(duplicate => [ duplicate.aposDocId, duplicate.replaceId ])
  );

  const { path = '' } = doc;
  const ancestorIds = path.split('/').reverse().slice(1);
  for (const ancestorId of ancestorIds) {
    try {
      const { aposDocId } = await manager.getTarget(req, duplicatedDocsMapping[ancestorId] || ancestorId);

      return aposDocId;
    } catch (error) {
      // continue search
    }
  }

  return '_home';
};

const insert = async ({
  manager,
  doc,
  req,
  duplicatedDocs
}) => {
  const targetId = await getTargetId({
    manager,
    doc,
    req,
    duplicatedDocs
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
  req,
  duplicatedDocs
}) => {

  const {
    _id,
    aposDocId,
    path,
    rank,
    level,
    ...patch
  } = doc;

  const move = doc.parkedId
    ? {}
    : {
      _targetId: await getTargetId({
        manager,
        doc,
        req,
        duplicatedDocs
      }),
      _position: 'lastChild'
    };

  return manager.patch(
    req.clone({
      body: {
        ...patch,
        ...move
      }
    }),
    _id
  );
};

module.exports = {
  insert,
  update
};