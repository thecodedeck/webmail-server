/* 
  This is a demo server for my email client application.

  It uses express to create a simple REST API to interact with the email server.
  It uses the nodemailer and imap libraries to interact with the email server.
  The server uses basic authentication to authenticate the user.

  The server provides the following endpoints:
  - /send-email: Send an email
  - /send-reply: Send a reply to an email
  - /mark-as-unread: Mark an email as unread
  - /mark-as-read: Mark an email as read
  - /get-emails: Get a list of emails
  - /move-to-folder: Move an email to a folder
  - /delete-email: Delete an email
  - /logout: Log out the user
  - /login: Log in the user
  - /logged-in: Check if the user is logged in
  
  Please note that this is not a production-ready server and is only meant for demonstration purposes.
  The auth flow is not secure and is only meant to demonstrate the basic functionality of the email client application.

  CodeDeck 2024
*/

const express = require("express");
const bodyParser = require("body-parser");
const simpleParser = require("mailparser").simpleParser;

const cors = require("cors");

const authMiddleware = require("./middleware/authMiddleware");
const { logout, getImap, getTransporter } = require("./auth/authMethods");

const app = express();
const port = 3000;

// Middleware to parse the request body
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Cors to allow cross-origin requests
app.use(
  cors({
    AllowHeaders: "Content-Type, Authorization",
    credentials: true,
    origin: "*",
  })
);

// IMAP fetch options
const fetchOptions = {
  bodies: "",
  struct: true,
  markSeen: false, // This ensures that emails are not marked as seen when fetched
  envelope: true,
};

// The currently selected folder
let selectedFolder = "INBOX";

// Send email
app.post("/send-email", authMiddleware, async (req, res) => {
  try {
    const { to, subject, message } = req.body;

    const user = req.credentials.user;

    const transporter = getTransporter();

    const mailOptions = {
      from: `${user}@localhost`,
      to: to,
      subject: subject,
      html: message,
    };

    transporter.sendMail(mailOptions, (err, info) => {
      if (err) {
        console.error(err);
        res.status(500).json({ message: "Error sending email" });
      } else {
        res.status(200).json({ message: "Email sent" });
      }

      transporter.close();
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error sending email" });
  }
});

// Send reply
app.post("/send-reply", authMiddleware, async (req, res) => {
  try {
    const { text, id } = req.body;

    const user = req.credentials.user;

    const imap = getImap();
    const transporter = getTransporter();

    imap.openBox(selectedFolder, false, (err, box) => {
      if (err) {
        console.error(err);
        res.status(500).json({ message: "Error opening mailbox" });
        return;
      }

      const fetch = imap.seq.fetch(id, fetchOptions);

      fetch.on("message", (msg) => {
        msg.on("body", async (stream, info) => {
          const email = await simpleParser(stream);

          // Compose the reply text with the original message
          const replyText = `${text}<br/><br/>On ${email.date}, ${email.from.text} wrote:<br/><br/>${email.textAsHtml}`;

          // Add Re: to the subject if it's not already there
          const subject = email.subject.startsWith("Re: ")
            ? email.subject
            : `Re: ${email.subject}`;

          // Compose the reply email
          const replyEmail = {
            from: `${user}@localhost`,
            to: email.from.text,
            subject,
            html: replyText,
            inReplyTo: email.messageId,
          };

          // Send the reply email
          transporter.sendMail(replyEmail, (err, info) => {
            if (err) {
              console.error(err);
              res.status(500).json({ message: "Error sending reply" });

              return;
            }

            res.status(200).json({ message: "Reply sent" });

            // Convert the email message to MIME format
            const rawMessage =
              `From: ${email.from.text}\r\n` +
              `To: ${email.to.text}\r\n` +
              `Subject: ${subject}\r\n` +
              `Content-Type: text/html; charset=utf-8\r\n\r\n` +
              `${replyText}\r\n`;

            // Append the reply to the Sent mailbox
            imap.append(rawMessage, { mailbox: "Sent" }, (err) => {
              if (err) {
                console.error(err);
              }
            });
          });
        });
      });
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching email" });
  }
});

// Mark as unread
app.post("/mark-as-unread", authMiddleware, async (req, res) => {
  try {
    const { id } = req.body;

    const imap = getImap();

    imap.openBox(selectedFolder, true, (err, box) => {
      if (err) {
        console.error(err);
        res.status(500).json({ message: "Error opening mailbox" });
        return;
      }

      imap.seq.delFlags(id, "\\Seen", (err) => {
        if (err) {
          console.error(err);
          res.status(500).json({ message: "Error marking email as unread" });
          return;
        }

        res.status(200).json({ message: "Email marked as unread" });
      });
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({ message: "Error marking email as unread" });
  }
});

// Mark as read
app.post("/mark-as-read", authMiddleware, async (req, res) => {
  try {
    const { id } = req.body;

    const imap = getImap();

    imap.openBox(selectedFolder, true, (err, box) => {
      if (err) {
        console.error(err);
        res.status(500).json({ message: "Error opening mailbox" });
        return;
      }

      imap.seq.addFlags(id, "\\Seen", (err) => {
        if (err) {
          console.error(err);
          res.status(500).json({ message: "Error marking email as seen" });
          return;
        }

        res.status(200).json({ message: "Email marked as seen" });
      });
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({ message: "Error marking email as seen" });
  }
});

// Endpoint to get a limited list of received emails
app.get("/get-emails", authMiddleware, async (req, res) => {
  try {
    const folder = req.query.folder || "INBOX";

    console.log("Fetching emails from folder:", folder);

    const imap = getImap();

    // We need to fetch the mailboxes first
    // We compare against the mailbox names to get the correct mailbox
    imap.getBoxes((err, boxes) => {
      if (err) {
        console.error(err);
        res.status(500).json({ message: "Error fetching mailboxes" });

        return;
      }

      console.log("Fetched mailboxes:", boxes);

      // Case insensitive search for the selected folder
      const selected = Object.keys(boxes).find((key) =>
        key.toLowerCase().includes(folder.toLowerCase())
      );

      if (!selected) {
        res.status(404).json({ message: "Folder not found" });

        return;
      }

      // Set the selected folder
      selectedFolder = selected;

      // Open the selected mailbox
      imap.openBox(selectedFolder, true, async (err, box) => {
        if (err) {
          console.error(err);
          res.status(500).json({ message: "Error opening mailbox" });

          return;
        }

        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.perPage) || 10;

        imap.search([], async (err, results) => {
          if (err) {
            console.error(err);
            res.status(500).json({ message: "Error fetching emails" });

            return;
          }

          // Get the total number of messages
          const totalMessages = results.length;

          const totalPages = Math.ceil(totalMessages / pageSize);

          // sort by newest first
          const sorted = results.sort((a, b) => b - a);
          const sliced = sorted.slice(
            (page - 1) * pageSize,
            (page - 1) * pageSize + pageSize
          );

          try {
            // Fetch the messages using results
            const fetch = imap.fetch(sliced, fetchOptions);

            const messages = [];

            // Process each message
            fetch.on("message", async (msg, seqno) => {
              const message = {
                id: seqno,
                seen: false,
                stream: null,
              };

              msg.on("body", (stream, info) => {
                message.stream = stream;
              });

              msg.once("attributes", (attrs) => {
                message.seen = attrs.flags.includes("\\Seen");
              });

              msg.once("end", () => {
                messages.push(message);
              });
            });

            fetch.once("end", () => {
              const messagePromises = [];

              messages.forEach((message) => {
                messagePromises.push(
                  new Promise(async (resolve) => {
                    const parsed = await simpleParser(message.stream);

                    const email = {};
                    email.from = parsed.from?.text || "N/A";
                    email.subject = parsed.subject || "N/A";
                    email.date = parsed.date || new Date();
                    email.text = parsed.text || "N/A";
                    email.html = parsed.textAsHtml || "N/A";
                    email.to = parsed.to?.text || "N/A";
                    email.id = message.id;
                    email.seen = message.seen;

                    resolve(email);
                  })
                );
              });

              Promise.all(messagePromises).then((emails) => {
                res.status(200).json({
                  emails,
                  page: page,
                  pageSize: pageSize,
                  totalPages: totalPages,
                  totalMessages: totalMessages,
                });
              });
            });
          } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Error fetching emails" });
          }
        });
      });
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching emails" });
  }
});

// Move to trash
app.post("/move-to-folder", authMiddleware, async (req, res) => {
  try {
    const { id, sourceFolder, folder } = req.body;

    const imap = getImap();

    imap.openBox(sourceFolder, false, (err, box) => {
      if (err) {
        console.error(err);
        res.status(500).json({ message: "Error opening mailbox" });

        return;
      }

      imap.seq.move(id, folder, (err) => {
        if (err) {
          console.error(err);
          res.status(500).json({ message: "Error moving email" });

          return;
        }

        res.status(200).json({ message: "Email moved to trash" });
      });
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error moving email to trash" });
  }
});

// Delete email
app.post("/delete-email", authMiddleware, async (req, res) => {
  try {
    const { id } = req.body;

    const imap = getImap();

    // Open the mailbox with openReadOnly set to false
    // This is required to delete emails
    imap.openBox("Trash", false, (err, box) => {
      if (err) {
        console.error(err);
        res.status(500).json({ message: "Error opening mailbox" });

        return;
      }

      // Add \Deleted flag to the specified email ID
      imap.seq.addFlags(id, "\\Deleted", (err) => {
        if (err) {
          console.error(err);
          res.status(500).json({ message: "Error deleting email" });

          return;
        }

        res.status(200).json({ message: "Email deleted" });

        // Expunge the mailbox to delete the email
        imap.expunge((err) => {
          if (err) {
            console.error(err);
            res.status(500).json({ message: "Error deleting email" });
          }
        });
      });
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error deleting email" });
  }
});

// Auth Methods
// Resets connection and instances
app.get("/logout", async (req, res) => {
  try {
    logout();
    res.status(200).json({ message: "Logged out" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error logging out" });
  }
});

// Logs in the user
// Please note that this is a somewhat redundant endpoint since the middleware already logs in the user
// Also nothing is secured here, so it's not recommended to use this in a production environment
app.get("/login", authMiddleware, async (req, res) => {
  try {
    res.status(200).json({ message: "Logged in" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error logging in" });
  }
});

// Displays whether the user is logged in
app.get("/logged-in", async (req, res) => {
  const imap = getImap();

  try {
    if (imap && imap.state === "authenticated") {
      res.status(200).json({ message: "Logged in" });
    } else {
      res.status(401).json({ message: "Not logged in" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error checking login status" });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

// End imap on exit
process.on("exit", () => {
  imap.end();
});
