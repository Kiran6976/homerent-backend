const roleMiddleware = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
    }
    
    next();
  };
};

const ownerMiddleware = (Model) => {
  return async (req, res, next) => {
    try {
      const document = await Model.findById(req.params.id);
      
      if (!document) {
        return res.status(404).json({ message: 'Resource not found' });
      }
      
      if (document.landlordId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Access denied. You are not the owner.' });
      }
      
      req.document = document;
      next();
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  };
};

module.exports = { roleMiddleware, ownerMiddleware };