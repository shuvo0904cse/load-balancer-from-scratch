import express from 'express';

const app = express();

app.get('/test', (req, res) => {
  res.send('Hello from server 4!');
});

app.listen(3004, () => {
  console.log('Server 4 is running on port 3004');
});