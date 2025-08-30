
const bcrypt = require('bcryptjs');
const password = "admin123"; // your new password
bcrypt.hash(password, 10).then(hash => {
  console.log("New hash:", hash);
});
