require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');

const USERS = [
  {
    name: 'Super Admin',
    email: 'admin@luhub.com',
    password: 'Admin@1234',
    role: 'admin',
    department: 'CSE',
    isVerified: true,
  },
  {
    name: 'John Student',
    email: 'student@luhub.com',
    password: 'Student@1234',
    role: 'student',
    department: 'CSE',
    semester: 5,
    isVerified: true,
  },
];

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('MongoDB connected');

  for (const data of USERS) {
    const existing = await User.findOne({ email: data.email });
    if (existing) {
      console.log(`⚠️  Skipped (already exists): ${data.email}`);
      continue;
    }
    const user = await User.create(data);
    console.log(`✅ Created [${user.role}] ${user.name} — ${user.email} | ID: ${user.studentId || user.facultyId || user._id}`);
  }

  await mongoose.disconnect();
  console.log('\nDone. Credentials:');
  console.log('  Admin   → admin@luhub.com   / Admin@1234');
  console.log('  Student → student@luhub.com / Student@1234');
}

seed().catch((err) => { console.error(err); process.exit(1); });
