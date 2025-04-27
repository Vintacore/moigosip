// models/Product.js
import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true
  },
  image: {
    type: String,
    default: 'default-product.png'
  },
  shop: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ShopOwner',
    required: true
  },
  isAvailable: {
    type: Boolean,
    default: true
  },

}, {
  timestamps: true
});

const Product = mongoose.model('Product', productSchema);
export default Product;