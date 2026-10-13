export const ensureAuthenticated = (req, res, next) => {
  if (req.session && req.session.user) return next();
  return res.redirect('/login');
};

export const ensureAdmin = (req, res, next) => {
  const user = req.session && req.session.user ? req.session.user : null;
  if (!user) return res.redirect('/login');

  if (user.role === 'admin') return next();

  return res.status(403).send('Forbidden: admin access only');
};
