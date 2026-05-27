const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const users = {};

app.post('/api/generate-reply', async (req, res) => {
  const { reviewText, businessType, tone, userId } = req.body;
  if (!reviewText) return res.status(400).json({ error: 'Review text is required' });

  const user = users[userId];
  if (!user || (!user.subscribed && user.freeTrials <= 0)) {
    return res.status(403).json({ error: 'Subscription required', needsPayment: true });
  }

  if (!user.subscribed) user.freeTrials -= 1;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: `You are a professional customer service expert helping a ${businessType || 'small business'} respond to customer reviews. Write a professional, ${tone || 'friendly and appreciative'} response to this customer review. Keep it concise (2-4 sentences), genuine, and on-brand for a local small business. Do not use hollow corporate phrases. Customer review: "${reviewText}" Write only the reply, nothing else.` }]
    });
    res.json({ reply: message.content[0].text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate reply' });
  }
});

app.post('/api/register', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  if (!users[email]) users[email] = { email, subscribed: false, freeTrials: 3 };
  res.json({ user: users[email] });
});

app.post('/api/create-checkout', async (req, res) => {
  const { email } = req.body;
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer_email: email,
      line_items: [{ price_data: { currency: 'usd', product_data: { name: 'ReplyMate Pro', description: 'Unlimited AI-powered review replies' }, unit_amount: 2900, recurring: { interval: 'month' } }, quantity: 1 }],
      success_url: `${process.env.BASE_URL || 'http://localhost:3000'}/success.html?email=${email}`,
      cancel_url: `${process.env.BASE_URL || 'http://localhost:3000'}`
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

app.post('/api/activate', (req, res) => {
  const { email } = req.body;
  if (!users[email]) users[email] = { email, subscribed: false, freeTrials: 3 };
  users[email].subscribed = true;
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ReplyMate running on port ${PORT}`));
