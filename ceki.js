const bcrypt = require('bcrypt');
const hash = '$2b$10$sz.CZw51vRLB.xZPiq90RORsoQXWM.4so8wd8uTDsu2slWF0jNuS2';

bcrypt.compare('admin', hash).then(console.log); // Harusnya true
