const getPagination = (pageInput, limitInput, totalItems) => {
  const page = Math.max(1, parseInt(pageInput || '1', 10));
  let limit = parseInt(limitInput || '10', 10);
  if (limit <= 0) limit = 10;
  if (limit > 100) limit = 100;
  
  const offset = (page - 1) * limit;
  const totalPages = Math.ceil(totalItems / limit);
  
  return {
    page,
    limit,
    offset,
    totalItems: parseInt(totalItems, 10),
    totalPages,
  };
};

module.exports = {
  getPagination,
};
