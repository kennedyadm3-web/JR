import fetch from 'node-fetch';
(async () => {
    try {
        const res = await fetch('http://localhost:3000/api/users');
        const data = await res.json();
        console.log(JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("fetch failed", e);
    }
})();
