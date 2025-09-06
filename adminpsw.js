const bcrypt = require('bcrypt');
const newPassword = 'admin123';
const hashedPassword = bcrypt.hashSync(newPassword, 10);
console.log(hashedPassword);