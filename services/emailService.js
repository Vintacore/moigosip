// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

import sgMail from '@sendgrid/mail';

// ✅ Set API key (with debug check)
const sendgridKey = process.env.SENDGRID_API_KEY;

if (!sendgridKey) {
  console.error('❌ SENDGRID_API_KEY is missing in .env!');
} else {
  sgMail.setApiKey(sendgridKey);
  console.log('✅ SendGrid API Key loaded');
}

// 🔔 Order Notification Email
export const sendVendorOrderNotification = async ({ to, vendorName, orderId, deliveryInstructions, totalPrice, itemCount }) => {
    const msg = {
      to,
      from: {
        name: 'MoiHub Orders',
        email: 'vinnykylex@gmail.com' 
      },
      subject: '📦 New Order Received!',
      html: `
        <html>
          <head>
            <style>
              body {
                font-family: 'Arial', sans-serif;
                color: #333;
                background-color: #f9f9f9;
                margin: 0;
                padding: 0;
              }
              .container {
                max-width: 600px;
                margin: 20px auto;
                background-color: #fff;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
              }
              .header {
                text-align: center;
                background-color: #4CAF50;
                color: #fff;
                padding: 10px;
                border-radius: 8px 8px 0 0;
              }
              .header h1 {
                margin: 0;
                font-size: 24px;
              }
              .content {
                padding: 20px;
              }
              .content p {
                font-size: 16px;
                line-height: 1.6;
              }
              .content ul {
                padding-left: 20px;
              }
              .content li {
                font-size: 16px;
              }
              .footer {
                text-align: center;
                font-size: 14px;
                color: #777;
                margin-top: 20px;
              }
              .footer p {
                margin: 0;
              }
              .button {
                display: inline-block;
                background-color: #4CAF50;
                color: white;
                padding: 10px 20px;
                text-decoration: none;
                border-radius: 4px;
                margin-top: 20px;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>New Order Received!</h1>
              </div>
              <div class="content">
                <p>Hello <strong>${vendorName}</strong>,</p>
                <p>You have received a new order.</p>
                <ul>
                  <li><strong>Order ID:</strong> ${orderId}</li>
                  <li><strong>Items:</strong> ${itemCount}</li>
                  <li><strong>Total Price:</strong> KES ${totalPrice}</li>
                  <li><strong>Instructions:</strong> ${deliveryInstructions || 'None'}</li>
                </ul>
                <p>Please log in to your dashboard to view more details and manage the order.</p>
                <a href="http://moihub.onrender.com/api/food/orders/vendor" class="button">View Order</a>
              </div>
              <div class="footer">
                <p>— MoiHub Team</p>
                <p>Visit us at: <a href="https://moihub-silk.vercel.app">moihub.com</a></p>
              </div>
            </div>
          </body>
        </html>
      `
    };
  
    try {
      await sgMail.send(msg);
      console.log(`✅ Order notification email sent to: ${to}`);
    } catch (error) {
      console.error(`❌ Failed to send order notification email: ${error}`);
    }
  };
  

// ⚠️ Subscription Expired Email
export const sendVendorSubscriptionExpired = async ({ to, vendorName }) => {
    const msg = {
      to,
      from: {
        name: 'MoiHub',
        email: 'vinnykylex@gmail.com' // ✅ Must be verified in SendGrid
      },
      subject: '⚠️ Your MoiHub Subscription Has Expired',
      html: `
        <html>
          <head>
            <style>
              body {
                font-family: 'Arial', sans-serif;
                background-color: #f2f2f2;
                color: #333;
                padding: 0;
                margin: 0;
              }
              .container {
                background-color: #fff;
                max-width: 600px;
                margin: 30px auto;
                padding: 30px;
                border-radius: 8px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
              }
              .header {
                text-align: center;
                background-color: #e53935;
                color: white;
                padding: 10px;
                border-radius: 8px 8px 0 0;
              }
              .header h1 {
                margin: 0;
                font-size: 22px;
              }
              .content {
                margin-top: 20px;
                line-height: 1.6;
                font-size: 16px;
              }
              .button {
                display: inline-block;
                margin-top: 20px;
                background-color: #4CAF50;
                color: white;
                padding: 10px 20px;
                border-radius: 4px;
                text-decoration: none;
              }
              .footer {
                margin-top: 30px;
                font-size: 14px;
                text-align: center;
                color: #777;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Subscription Expired</h1>
              </div>
              <div class="content">
                <p>Dear <strong>${vendorName}</strong>,</p>
                <p>We wanted to let you know that your MoiHub subscription has expired and your vendor account has been temporarily deactivated.</p>
                <p>To resume receiving orders and accessing your dashboard, please renew your subscription.</p>
                
              </div>
              <div class="footer">
                <p>— MoiHub Team</p>
                <p>0745276898</p>
              </div>
            </div>
          </body>
        </html>
      `
    };
  
    try {
      await sgMail.send(msg);
      console.log(`✅ Subscription expired email sent to: ${to}`);
    } catch (err) {
      console.error('❌ Failed to send subscription expired email:', err.response?.body || err.message || err);
    }
  };
  
