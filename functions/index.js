const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

// Import modules
const roleActions = require('./roleActions');
const gamePhase = require('./gamePhase');
const voting = require('./voting');
const teamManager = require('./teamManager');

// Expose role actions as cloud functions
exports.innkeeperProtect = functions.https.onRequest(roleActions.innkeeperProtect);
exports.gunmanKill = functions.https.onRequest(roleActions.gunmanKill);
exports.sheriffInvestigate = functions.https.onRequest(roleActions.sheriffInvestigate);
exports.prostituteBlock = functions.https.onRequest(roleActions.prostituteBlock);
exports.chieftainKill = functions.https.onRequest(roleActions.chieftainKill);
exports.peeperWatch = functions.https.onRequest(roleActions.peeperWatch);
exports.gunslingerShoot = functions.https.onRequest(roleActions.gunslingerShoot);

// Expose game phase functions
exports.startGame = functions.https.onRequest(gamePhase.startGame);
exports.advancePhase = functions.https.onRequest(gamePhase.advancePhase);

// Expose voting functions
exports.submitVote = functions.https.onRequest(voting.submitVote);
exports.processVotes = functions.https.onRequest(voting.processVotes);

// Expose team management functions
exports.checkWinConditions = functions.https.onRequest(teamManager.checkWinConditions);

// Settings update function
exports.updateSettings = functions.https.onRequest(async (req, res) => {
    try {
        const { lobbyCode, hostId, settings } = req.body;

        if (!lobbyCode || !hostId || !settings) {
            return res.status(400).json({ error: "Missing lobbyCode, hostId, or settings" });
        }

        const lobbyRef = admin.firestore().collection("lobbies").doc(lobbyCode.toUpperCase());
        const lobbyDoc = await lobbyRef.get();

        if (!lobbyDoc.exists) {
            return res.status(404).json({ error: "Lobby not found" });
        }

        const lobbyData = lobbyDoc.data();

        if (lobbyData.hostUid !== hostId) {
            return res.status(403).json({ error: "Only host can update settings" });
        }

        await lobbyRef.update({
            settings
        });

        return res.status(200).json({ message: "Settings updated" });
    } catch (error) {
        console.error("updateSettings error:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
});

