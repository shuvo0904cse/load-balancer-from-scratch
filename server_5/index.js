import express from 'express';

const app = express();

app.get('/test', (req, res) => {
  res.send('Hello from server 5!');
});

app.listen(3005, () => {
  console.log('Server 5 is running on port 3005');
});