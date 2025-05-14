const admin = require('firebase-admin');
const db = admin.firestore();

// Start the game
exports.startGame = async (req, res) => {
    try {
        const { lobbyCode, hostId } = req.body;

        if (!lobbyCode || !hostId) {
            return res.status(400).json({ error: 'Missing lobbyCode or hostId' });
        }

        const lobbyRef = db.collection('lobbies').doc(lobbyCode.toUpperCase());
        const lobbyDoc = await lobbyRef.get();

        if (!lobbyDoc.exists) {
            return res.status(404).json({ error: 'Lobby not found' });
        }

        const lobbyData = lobbyDoc.data();

        if (lobbyData.hostUid !== hostId) {
            return res.status(403).json({ error: 'Only the host can start the game' });
        }

        const players = lobbyData.players || [];
        const roleSettings = lobbyData.roles || {};

        let rolesPool = [];
        for (const [role, count] of Object.entries(roleSettings)) {
            rolesPool.push(...Array(count).fill(role));
        }

        if (rolesPool.length !== players.length) {
            return res
                .status(400)
                .json({ error: "Player count doesn't match total roles" });
        }

        rolesPool = rolesPool.sort(() => Math.random() - 0.5);

        const updatedPlayers = players.map((player, index) => ({
            ...player,
            role: rolesPool[index],
        }));

        await lobbyRef.update({
            players: updatedPlayers,
            status: 'started',
            startedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return res.status(200).json({ message: 'Game started successfully' });
    } catch (error) {
        console.error('startGame error:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Advance the game phase from day to night or night to day
exports.advancePhase = async (req, res) => {
    try {
        const { lobbyCode, hostId } = req.body;

        if (!lobbyCode || !hostId) {
            return res.status(400).json({ error: "Missing lobbyCode or hostId" });
        }

        const lobbyRef = db.collection("lobbies").doc(lobbyCode.toUpperCase());
        const lobbyDoc = await lobbyRef.get();

        if (!lobbyDoc.exists) {
            return res.status(404).json({ error: "Lobby not found" });
        }

        const lobbyData = lobbyDoc.data();
        const players = lobbyData.players || [];

        if (lobbyData.hostUid !== hostId) {
            return res.status(403).json({ error: "Only host can advance the phase" });
        }

        const currentPhase = lobbyData.phase || "night";
        const dayCount = lobbyData.dayCount || 1;

        const newPhase = currentPhase === "night" ? "day" : "night";
        const newDayCount = currentPhase === "night" ? dayCount : dayCount + 1;

        // Reset night action data when moving to a new phase
        let roleDataUpdate = { ...lobbyData.roleData } || {};
        let updatedPlayers = [...players];

        // When transitioning from night to day, process night actions
        if (newPhase === 'day') {
            // First check who is blocked by prostitute
            const blockedPlayerId = roleDataUpdate.prostitute?.blockedId || null;

            // Determine who will be the killer and the target
            let killerRole = 'Gunman';
            let targetId = null;
            let killerId = null;

            // Check if chieftain has issued a kill order (and is not blocked)
            const chieftainId = players.find(p => p.role === 'Chieftain' && p.isAlive)?.id;
            const isChieftainBlocked = chieftainId && chieftainId === blockedPlayerId;

            if (roleDataUpdate.chieftain && roleDataUpdate.chieftain.targetId && !isChieftainBlocked) {
                // Chieftain's order takes precedence
                targetId = roleDataUpdate.chieftain.targetId;

                if (roleDataUpdate.chieftain.hasGunman) {
                    // Gunman executes chieftain's order
                    killerRole = 'Gunman';
                    killerId = players.find(p => p.role === 'Gunman' && p.isAlive)?.id;
                } else {
                    // Chieftain executes the kill directly
                    killerRole = 'Chieftain';
                    killerId = chieftainId;
                }
            } else if (roleDataUpdate.gunman && roleDataUpdate.gunman.targetId) {
                // No chieftain order, use gunman's choice
                const gunmanId = players.find(p => p.role === 'Gunman' && p.isAlive)?.id;
                const isGunmanBlocked = gunmanId && gunmanId === blockedPlayerId;

                if (!isGunmanBlocked) {
                    targetId = roleDataUpdate.gunman.targetId;
                    killerId = gunmanId;
                }
            }

            // Process the kill if we have a target and killer
            if (targetId && killerId) {
                const targetIndex = updatedPlayers.findIndex(p => p.id === targetId); if (targetIndex !== -1) {
                    const targetPlayer = updatedPlayers[targetIndex];

                    // Check if target is hosted by innkeeper (if innkeeper is not blocked)
                    const innkeeperId = players.find(p => p.role === 'Innkeeper' && p.isAlive)?.id;
                    const isInnkeeperBlocked = innkeeperId && innkeeperId === blockedPlayerId;
                    const isProtected = !isInnkeeperBlocked &&
                        roleDataUpdate.innkeeper &&
                        roleDataUpdate.innkeeper.protectedId === targetId;

                    // Check if target is immune (add role-specific immunity checks here)
                    const isImmune = targetPlayer.role === 'ImmuneRole'; // Replace with actual immune roles

                    // Kill the target if they're not protected or immune
                    if (!isProtected && !isImmune) {
                        updatedPlayers[targetIndex] = {
                            ...targetPlayer,
                            isAlive: false,
                            killedBy: killerRole
                        };
                    }
                }
            }

            // Reset targets
            if (roleDataUpdate.gunman) {
                roleDataUpdate.gunman = {
                    ...roleDataUpdate.gunman,
                    targetId: null
                };
            }

            if (roleDataUpdate.chieftain) {
                roleDataUpdate.chieftain = {
                    ...roleDataUpdate.chieftain,
                    targetId: null
                };
            }

            // Reset innkeeper's hosting
            if (roleDataUpdate.innkeeper) {
                roleDataUpdate.innkeeper = {
                    ...roleDataUpdate.innkeeper,
                    protectedId: null
                };
            }            // Reset prostitute's block
            if (roleDataUpdate.prostitute) {
                roleDataUpdate.prostitute = {
                    ...roleDataUpdate.prostitute,
                    blockedId: null
                };
            }

            // Process Peeper's watch action - collect list of visitors to the watched player
            if (roleDataUpdate.peeper && roleDataUpdate.peeper.watchId) {
                const watchedPlayerId = roleDataUpdate.peeper.watchId;
                const visitors = [];

                // Check all role actions that target other players and track who visited the watched player                // Innkeeper visit
                if (roleDataUpdate.innkeeper && roleDataUpdate.innkeeper.protectedId === watchedPlayerId) {
                    const innkeeperId = players.find(p => p.role === 'Innkeeper' && p.isAlive)?.id;
                    const isInnkeeperBlocked = innkeeperId && innkeeperId === blockedPlayerId;

                    if (innkeeperId && !isInnkeeperBlocked) {
                        visitors.push({
                            id: innkeeperId,
                            name: players.find(p => p.id === innkeeperId)?.name || 'Unknown',
                            role: 'visitor' // Don't reveal actual role, just that they visited
                        });
                    }
                }

                // Gunman visit
                if (targetId === watchedPlayerId && killerId && killerRole === 'Gunman') {
                    const isGunmanBlocked = killerId === blockedPlayerId;

                    if (!isGunmanBlocked) {
                        visitors.push({
                            id: killerId,
                            name: players.find(p => p.id === killerId)?.name || 'Unknown',
                            role: 'visitor'
                        });
                    }
                }

                // Chieftain visit (if directly killing)
                if (targetId === watchedPlayerId && killerId && killerRole === 'Chieftain') {
                    const isChieftainBlocked = killerId === blockedPlayerId;

                    if (!isChieftainBlocked) {
                        visitors.push({
                            id: killerId,
                            name: players.find(p => p.id === killerId)?.name || 'Unknown',
                            role: 'visitor'
                        });
                    }
                }

                // Sheriff visit
                if (roleDataUpdate.sheriff && roleDataUpdate.sheriff.targetId === watchedPlayerId) {
                    const sheriffId = players.find(p => p.role === 'Sheriff' && p.isAlive)?.id;
                    const isSheriffBlocked = sheriffId && sheriffId === blockedPlayerId;

                    if (sheriffId && !isSheriffBlocked) {
                        visitors.push({
                            id: sheriffId,
                            name: players.find(p => p.id === sheriffId)?.name || 'Unknown',
                            role: 'visitor'
                        });
                    }
                }

                // Prostitute visit
                if (blockedPlayerId === watchedPlayerId) {
                    const prostituteId = players.find(p => p.role === 'Prostitute' && p.isAlive)?.id;

                    if (prostituteId) {
                        visitors.push({
                            id: prostituteId,
                            name: players.find(p => p.id === prostituteId)?.name || 'Unknown',
                            role: 'visitor'
                        });
                    }
                }

                // Update the peeper's visitor list
                roleDataUpdate.peeper = {
                    ...roleDataUpdate.peeper,
                    visitors: visitors,
                    watchResult: visitors.length > 0
                        ? `${visitors.length} player(s) visited your target.`
                        : 'No one visited your target.'
                };
            }
        } await lobbyRef.update({
            phase: newPhase,
            dayCount: newDayCount,
            phaseStartedAt: admin.firestore.FieldValue.serverTimestamp(),
            roleData: roleDataUpdate,
            players: updatedPlayers
        });

        // When moving to day phase, also check sheriff results if not blocked
        if (newPhase === 'day' && roleDataUpdate.sheriff && roleDataUpdate.sheriff.targetId) {
            const sheriffId = players.find(p => p.role === 'Sheriff' && p.isAlive)?.id;
            const isSheriffBlocked = sheriffId && sheriffId === roleDataUpdate.prostitute?.blockedId;

            // If sheriff was blocked, clear their investigation result
            if (isSheriffBlocked && roleDataUpdate.sheriff) {
                await lobbyRef.update({
                    'roleData.sheriff.result': null
                });
            }
        } else if (newPhase === 'night') {
            // Reset Peeper's watch data when moving to a new night
            if (roleDataUpdate.peeper) {
                await lobbyRef.update({
                    'roleData.peeper.watchId': null,
                    'roleData.peeper.visitors': [],
                    'roleData.peeper.watchResult': null
                });
            }
        }

        return res.status(200).json({
            message: "Phase updated",
            newPhase,
            newDayCount
        });
    } catch (error) {
        console.error("advancePhase error:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};
