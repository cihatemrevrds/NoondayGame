const admin = require('firebase-admin');
const db = admin.firestore();

// Import team manager for role checks
const teamManager = require('./teamManager');

// Innkeeper's action - host a player during the night to protect them
exports.innkeeperProtect = async (req, res) => {
    try {
        const { lobbyCode, innkeeperId, targetId } = req.body;

        if (!lobbyCode || !innkeeperId || !targetId) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        const lobbyRef = db.collection('lobbies').doc(lobbyCode.toUpperCase());
        const lobbyDoc = await lobbyRef.get();

        if (!lobbyDoc.exists) {
            return res.status(404).json({ error: 'Lobby not found' });
        }

        const lobbyData = lobbyDoc.data();
        const players = lobbyData.players || [];
        const innkeeper = players.find(p => p.id === innkeeperId);

        // Verify player is innkeeper and alive
        if (!innkeeper || innkeeper.role !== 'Innkeeper' || !innkeeper.isAlive) {
            return res.status(403).json({ error: 'You are not the innkeeper or not alive' });
        }        // Check if we're in night phase
        if (lobbyData.phase !== 'night') {
            return res.status(400).json({ error: 'Action can only be performed at night' });
        }

        // Get innkeeper data
        const innkeeperData = lobbyData.roleData?.innkeeper || {};

        // Prevent innkeeper from hosting themselves
        if (targetId === innkeeperId) {
            return res.status(400).json({ error: 'You cannot host yourself. You must host other players.' });
        }

        // Store innkeeper's hosting choice
        const updatedRoleData = {
            ...(lobbyData.roleData || {}),
            innkeeper: {
                ...innkeeperData,
                protectedId: targetId
            }
        }; await lobbyRef.update({
            roleData: updatedRoleData
        });

        return res.status(200).json({ message: 'Hosting applied successfully' });
    } catch (error) {
        console.error('innkeeperProtect error:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Gunman's action - kill a player during the night
exports.gunmanKill = async (req, res) => {
    try {
        const { lobbyCode, gunmanId, targetId } = req.body;

        if (!lobbyCode || !gunmanId || !targetId) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        const lobbyRef = db.collection('lobbies').doc(lobbyCode.toUpperCase());
        const lobbyDoc = await lobbyRef.get();

        if (!lobbyDoc.exists) {
            return res.status(404).json({ error: 'Lobby not found' });
        }

        const lobbyData = lobbyDoc.data();
        const players = lobbyData.players || [];
        const gunman = players.find(p => p.id === gunmanId);

        // Verify player is gunman and alive
        if (!gunman || gunman.role !== 'Gunman' || !gunman.isAlive) {
            return res.status(403).json({ error: 'You are not the gunman or not alive' });
        }

        // Check if we're in night phase
        if (lobbyData.phase !== 'night') {
            return res.status(400).json({ error: 'Action can only be performed at night' });
        }

        // Check if target is alive
        const target = players.find(p => p.id === targetId);
        if (!target || !target.isAlive) {
            return res.status(400).json({ error: 'Target is not alive' });
        }

        // Store gunman's kill choice
        const updatedRoleData = {
            ...(lobbyData.roleData || {}),
            gunman: {
                ...(lobbyData.roleData?.gunman || {}),
                targetId: targetId
            }
        };

        await lobbyRef.update({
            roleData: updatedRoleData
        });

        return res.status(200).json({ message: 'Kill target selected successfully' });
    } catch (error) {
        console.error('gunmanKill error:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Sheriff's action - investigate a player during the night
exports.sheriffInvestigate = async (req, res) => {
    try {
        const { lobbyCode, sheriffId, targetId } = req.body;

        if (!lobbyCode || !sheriffId || !targetId) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        const lobbyRef = db.collection('lobbies').doc(lobbyCode.toUpperCase());
        const lobbyDoc = await lobbyRef.get();

        if (!lobbyDoc.exists) {
            return res.status(404).json({ error: 'Lobby not found' });
        }

        const lobbyData = lobbyDoc.data();
        const players = lobbyData.players || [];
        const sheriff = players.find(p => p.id === sheriffId);

        // Verify player is sheriff and alive
        if (!sheriff || sheriff.role !== 'Sheriff' || !sheriff.isAlive) {
            return res.status(403).json({ error: 'You are not the sheriff or not alive' });
        }

        // Check if we're in night phase
        if (lobbyData.phase !== 'night') {
            return res.status(400).json({ error: 'Action can only be performed at night' });
        }

        // Check if target is alive
        const target = players.find(p => p.id === targetId);
        if (!target || !target.isAlive) {
            return res.status(400).json({ error: 'Target is not alive' });
        }        // Determine investigation result
        let result = 'innocent';
        const targetTeam = teamManager.getTeamByRole(target.role);

        // Bandits appear suspicious except for Chieftain who appears innocent
        if (targetTeam === 'Bandit' && target.role !== 'Chieftain') {
            result = 'suspicious';
        }

        // Some neutral roles appear suspicious
        if (targetTeam === 'Neutral' && ['Serial Killer', 'Arsonist', 'Witch'].includes(target.role)) {
            result = 'suspicious';
        }

        // Store sheriff's investigation result
        const updatedRoleData = {
            ...(lobbyData.roleData || {}),
            sheriff: {
                ...(lobbyData.roleData?.sheriff || {}),
                targetId: targetId,
                result: result
            }
        };

        await lobbyRef.update({
            roleData: updatedRoleData
        });

        return res.status(200).json({
            message: 'Investigation complete',
            result: result
        });
    } catch (error) {
        console.error('sheriffInvestigate error:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Prostitute's action - block a player from using their ability during the night
exports.prostituteBlock = async (req, res) => {
    try {
        const { lobbyCode, prostituteId, targetId } = req.body;

        if (!lobbyCode || !prostituteId || !targetId) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        const lobbyRef = db.collection('lobbies').doc(lobbyCode.toUpperCase());
        const lobbyDoc = await lobbyRef.get();

        if (!lobbyDoc.exists) {
            return res.status(404).json({ error: 'Lobby not found' });
        }

        const lobbyData = lobbyDoc.data();
        const players = lobbyData.players || [];
        const prostitute = players.find(p => p.id === prostituteId);

        // Verify player is prostitute and alive
        if (!prostitute || prostitute.role !== 'Prostitute' || !prostitute.isAlive) {
            return res.status(403).json({ error: 'You are not the prostitute or not alive' });
        }

        // Check if we're in night phase
        if (lobbyData.phase !== 'night') {
            return res.status(400).json({ error: 'Action can only be performed at night' });
        }

        // Check if target is alive
        const target = players.find(p => p.id === targetId);
        if (!target || !target.isAlive) {
            return res.status(400).json({ error: 'Target is not alive' });
        }

        // Prevent self-targeting
        if (targetId === prostituteId) {
            return res.status(400).json({ error: 'You cannot block yourself' });
        }

        // Store prostitute's block choice
        const updatedRoleData = {
            ...(lobbyData.roleData || {}),
            prostitute: {
                ...(lobbyData.roleData?.prostitute || {}),
                blockedId: targetId
            }
        };

        await lobbyRef.update({
            roleData: updatedRoleData
        });

        return res.status(200).json({
            message: 'Block action applied successfully'
        });
    } catch (error) {
        console.error('prostituteBlock error:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Chieftain's action - order a kill (overrides gunman's choice)
exports.chieftainKill = async (req, res) => {
    try {
        const { lobbyCode, chieftainId, targetId } = req.body;

        if (!lobbyCode || !chieftainId || !targetId) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        const lobbyRef = db.collection('lobbies').doc(lobbyCode.toUpperCase());
        const lobbyDoc = await lobbyRef.get();

        if (!lobbyDoc.exists) {
            return res.status(404).json({ error: 'Lobby not found' });
        }

        const lobbyData = lobbyDoc.data();
        const players = lobbyData.players || [];
        const chieftain = players.find(p => p.id === chieftainId);

        // Verify player is chieftain and alive
        if (!chieftain || chieftain.role !== 'Chieftain' || !chieftain.isAlive) {
            return res.status(403).json({ error: 'You are not the chieftain or not alive' });
        }

        // Check if we're in night phase
        if (lobbyData.phase !== 'night') {
            return res.status(400).json({ error: 'Action can only be performed at night' });
        }

        // Check if target is alive
        const target = players.find(p => p.id === targetId);
        if (!target || !target.isAlive) {
            return res.status(400).json({ error: 'Target is not alive' });
        }

        // Check if there's at least one gunman alive
        const aliveGunman = players.find(p => p.role === 'Gunman' && p.isAlive);

        // Store chieftain's kill choice
        const updatedRoleData = {
            ...(lobbyData.roleData || {}),
            chieftain: {
                ...(lobbyData.roleData?.chieftain || {}),
                targetId: targetId,
                hasGunman: !!aliveGunman
            }
        };

        await lobbyRef.update({
            roleData: updatedRoleData
        });

        return res.status(200).json({
            message: aliveGunman
                ? 'Kill order issued to gunman'
                : 'Kill target selected (will execute directly)'
        });
    } catch (error) {
        console.error('chieftainKill error:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Peeper's action - select a player to watch during the night
exports.peeperWatch = async (req, res) => {
    try {
        const { lobbyCode, peeperId, targetId } = req.body;

        if (!lobbyCode || !peeperId || !targetId) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        const lobbyRef = db.collection('lobbies').doc(lobbyCode.toUpperCase());
        const lobbyDoc = await lobbyRef.get();

        if (!lobbyDoc.exists) {
            return res.status(404).json({ error: 'Lobby not found' });
        }

        const lobbyData = lobbyDoc.data();
        const players = lobbyData.players || [];
        const peeper = players.find(p => p.id === peeperId);

        // Verify player is peeper and alive
        if (!peeper || peeper.role !== 'Peeper' || !peeper.isAlive) {
            return res.status(403).json({ error: 'You are not the peeper or not alive' });
        }

        // Check if we're in night phase
        if (lobbyData.phase !== 'night') {
            return res.status(400).json({ error: 'Action can only be performed at night' });
        }

        // Check if target is alive
        const target = players.find(p => p.id === targetId);
        if (!target || !target.isAlive) {
            return res.status(400).json({ error: 'Target is not alive' });
        }

        // Store peeper's watch choice
        const updatedRoleData = {
            ...(lobbyData.roleData || {}),
            peeper: {
                ...(lobbyData.roleData?.peeper || {}),
                watchId: targetId,
                visitors: [] // Will be populated at the end of the night
            }
        };

        await lobbyRef.update({
            roleData: updatedRoleData
        });

        return res.status(200).json({
            message: 'Watch target selected successfully'
        });
    } catch (error) {
        console.error('peeperWatch error:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Gunslinger's action - can kill at any time (day or night) but has limited bullets
exports.gunslingerShoot = async (req, res) => {
    try {
        const { lobbyCode, gunslingerId, targetId } = req.body;

        if (!lobbyCode || !gunslingerId || !targetId) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        const lobbyRef = db.collection('lobbies').doc(lobbyCode.toUpperCase());
        const lobbyDoc = await lobbyRef.get();

        if (!lobbyDoc.exists) {
            return res.status(404).json({ error: 'Lobby not found' });
        }

        const lobbyData = lobbyDoc.data();
        const players = lobbyData.players || [];
        const gunslinger = players.find(p => p.id === gunslingerId);

        // Verify player is gunslinger and alive
        if (!gunslinger || gunslinger.role !== 'Gunslinger' || !gunslinger.isAlive) {
            return res.status(403).json({ error: 'You are not the gunslinger or not alive' });
        }

        // Get gunslinger's data or initialize with 2 bullets
        const gunslingerData = lobbyData.roleData?.gunslinger || { bulletsRemaining: 2, killedTown: false };

        // Check if gunslinger has bullets left
        if (gunslingerData.bulletsRemaining <= 0) {
            return res.status(400).json({ error: 'You have no bullets remaining' });
        }

        // Check if player already killed a town member (and has only 1 bullet left)
        if (gunslingerData.killedTown && gunslingerData.bulletsRemaining <= 1) {
            return res.status(400).json({ error: 'You killed a town member and cannot use your second bullet' });
        }

        // Check if target is alive
        const target = players.find(p => p.id === targetId);
        if (!target || !target.isAlive) {
            return res.status(400).json({ error: 'Target is not alive' });
        }

        // Prevent self-targeting
        if (targetId === gunslingerId) {
            return res.status(400).json({ error: 'You cannot shoot yourself' });
        }

        // Get target team - used to check if a town member was killed
        const targetTeam = teamManager.getTeamByRole(target.role);
        const isTargetTown = targetTeam === 'Town';

        // Calculate bullets remaining
        let newBulletsRemaining = gunslingerData.bulletsRemaining - 1;

        // Kill the target immediately
        const updatedPlayers = [...players];
        const targetIndex = updatedPlayers.findIndex(p => p.id === targetId);

        if (targetIndex !== -1) {
            updatedPlayers[targetIndex] = {
                ...target,
                isAlive: false,
                killedBy: 'Gunslinger'
            };
        }

        // Update gunslinger's data
        const updatedRoleData = {
            ...(lobbyData.roleData || {}),
            gunslinger: {
                ...gunslingerData,
                bulletsRemaining: newBulletsRemaining,
                killedTown: gunslingerData.killedTown || isTargetTown,
                lastTarget: targetId
            }
        };

        await lobbyRef.update({
            roleData: updatedRoleData,
            players: updatedPlayers
        });

        return res.status(200).json({
            message: 'Shot fired successfully',
            bulletsRemaining: newBulletsRemaining,
            killedTown: gunslingerData.killedTown || isTargetTown
        });
    } catch (error) {
        console.error('gunslingerShoot error:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};
