const getTargetId = async ({
  manager,
  doc,
  req,
  duplicatedDocs = [],
  replaceAposDocIds = []
}) => {
  if (doc.archived) {
    return '_archive';
  }

  const idMapping = Object.fromEntries(replaceAposDocIds);
  const duplicatedDocsMapping = duplicatedDocs.map(duplicate => {
    //
  });
  console.log({ duplicatedDocsMapping, duplicatedDocs });

  const { path = '' } = doc;
  const ancestorIds = path.split('/').reverse().slice(1);
  for (const ancestorId of ancestorIds) {
    try {
      console.log({ idMapping, mapping: idMapping[ancestorId], ancestorId })
      const { aposDocId } = await manager.getTarget(req, idMapping[ancestorId] || ancestorId);

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
  duplicatedDocs,
  replaceAposDocIds
}) => {
  const targetId = await getTargetId({
    manager,
    doc,
    req,
    duplicatedDocs,
    replaceAposDocIds
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
  duplicatedDocs,
  replaceAposDocIds
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
        duplicatedDocs,
        replaceAposDocIds
      }),
      _position: 'lastChild'
    };
  console.log({ move })

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
