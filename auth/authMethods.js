const nodemailer = require("nodemailer");
const Imap = require("imap");
const util = require("util");

// IMAP connection
let imap = null;

// NodeMailer transporter configuration
let transporter = null;

getTransporter = () => {
  return transporter;
};

getImap = () => {
  if (imap && imap.state === "open") {
    imap.closeBox(true, () => {
      console.log("Closed box");
    });
  }

  return imap;
};

nodeMailerAuth = (user, pass) => {
  transporter = nodemailer.createTransport({
    service: "127.0.0.1",
    secure: false,
    port: 25,
    auth: {
      user,
      pass,
    },
  });
};

const imapConnect = util.promisify((config, callback) => {
  const connection = new Imap(config);

  connection.once("error", (err) => {
    console.error(err);
    callback(err);
  });

  connection.once("end", () => {
    console.log("Connection ended.");
  });

  connection.once("ready", () => {
    console.log("Connection ready.");
    callback(null, connection);
  });

  console.log("Connecting to IMAP server");
  connection.connect();
});

const imapAuth = async (user, password) => {
  // If connection is already established, end it
  if (imap && imap.state === "open") {
    imap.end();
  }

  const imapConfig = {
    user,
    password,
    host: "127.0.0.1",
    port: 143,
    tls: false,
  };

  try {
    imap = await imapConnect(imapConfig);
  } catch (error) {
    console.error("Error connecting to IMAP server:", error);
    throw error;
  }
};

// Called to end connection and logout
logout = () => {
  if (imap) {
    imap.end();
    imap = null;
  }

  if (transporter) {
    transporter.close();
    transporter = null;
  }
};

module.exports = {
  nodeMailerAuth,
  imapAuth,
  getTransporter,
  getImap,
  logout,
};
