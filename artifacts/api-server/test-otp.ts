import { authenticator } from 'otplib';
const secret = authenticator.generateSecret();
console.log(secret);
