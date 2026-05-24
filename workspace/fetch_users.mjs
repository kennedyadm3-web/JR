import fetch from 'node-fetch';

(async () => {
  try {
    const res = await fetch('http://localhost:3000/api/users');
    const text = await res.text();
    console.log(text);
  } catch (err) {
    console.error(err);
  }
})();
