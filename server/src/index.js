import 'dotenv/config';
import app from './app.js';

app.listen(process.env.PORT, () =>
  console.log(`API on http://localhost:${process.env.PORT}`)
);