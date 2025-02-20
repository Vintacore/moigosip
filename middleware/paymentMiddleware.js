// Create new file paymentMiddleware.js
const validatePaymentRequest = async (req, res, next) => {
    try {
      const { phone_number } = req.body;
      
      // Validate phone number format
      if (!phone_number.match(/^(?:254|\+254|0)?([71](?:[0-9]){8})$/)) {
        return res.status(400).json({
          message: 'Invalid phone number format. Use 254XXXXXXXXX'
        });
      }
  
      // Check for existing pending payment
      const existingPayment = await Payment.findOne({
        user: req.user.userId,
        status: 'pending',
        payment_expiry: { $gt: new Date() }
      });
  
      if (existingPayment) {
        return res.status(409).json({
          message: 'You have a pending payment. Please complete or cancel it first.',
          payment_id: existingPayment._id
        });
      }
  
      // Check seat lock
      const matatu = await Matatu.findOne({
        "seatLayout": {
          $elemMatch: {
            locked_by: req.user.userId,
            lock_expiry: { $gt: new Date() }
          }
        }
      });
  
      if (!matatu) {
        return res.status(400).json({
          message: 'No valid seat lock found. Please select a seat first.'
        });
      }
  
      req.matatu = matatu;
      next();
    } catch (error) {
      console.error('Payment validation error:', error);
      res.status(500).json({ message: 'Error validating payment request' });
    }
  };
  
  export default validatePaymentRequest;