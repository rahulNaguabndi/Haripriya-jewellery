import 'dotenv/config';
import app from './app.js';

const PORT = process.env.PORT || 4100;

app.listen(PORT, () => {
  console.log(`Jewelry lending API listening on port ${PORT}`);
});
