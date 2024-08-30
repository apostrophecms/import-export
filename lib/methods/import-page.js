const insert = ({
  manager,
  doc,
  req
}) => {
  const target = '_home';
  const position = 'lastChild';

  return manager.insert(
    req,
    target,
    position,
    doc,
    { setModified: false }
  );
};

const update = ({
  manager,
  doc,
  req
}) => {
  const {
    path,
    rank,
    level,
    ...patch
  } = doc;
  // doc.path = existingDoc.path;
  // doc.rank = existingDoc.rank;
  // doc.level = existingDoc.level;

  return manager.patch(
    req.clone({
      body: {
        ...patch,
        _targetId: '_home',
        _position: 'lastChild'
      }
    }),
    doc._id
  );
};

module.exports = {
  insert,
  update
};
