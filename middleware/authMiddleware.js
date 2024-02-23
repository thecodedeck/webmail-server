const {
  imapAuth,
  nodeMailerAuth,
  getImap,
  getTransporter,
} = require("../auth/authMethods");

const basicAuth = require("basic-auth");

// Checks if the user is authenticated
module.exports = async (req, res, next) => {
  const Credentials = basicAuth(req) || {};

  const user = Credentials.name;
  const password = Credentials.pass;

  const imap = getImap();
  const transporter = getTransporter();

  if (user && password) {
    if (imap === null) {
      await imapAuth(user, password);
    }

    if (transporter === null) {
      nodeMailerAuth(user, password);
    }

    req.credentials = { user, password };

    return next();
  }

  res.status(401).json({ message: "You are not authenticated" });
};
