import React, { useEffect, useRef, useState } from 'react';
import { useHistory, useLocation, useParams } from 'react-router-dom';
import { Button, CircularProgress, List, ListItemText } from '@mui/material';

import roomManager from '../../utils/roomManager2';
import { Player } from '../../models/player';
import styles from './GameRoom.module.sass';
import MessageHandler, { IMessageHandler } from '../../utils/messageHandler';
import { ErrorMessage, MessageType } from '../../models/message';
import * as gameRoomActions from '../../actions/gameRoom';
import { getRandomName } from '../../constants/names';
import routeURLs from '../Routes/urls';
import useGameRoom from './useGameRoom';
import { getLocalStorage } from '../../utils/storageUtils';

interface RouteParams {
    roomID: string;
}

interface RouteState {
    name?: string;
}

const GameRoom: React.FunctionComponent = () => {
    const { roomID } = useParams<RouteParams>();
    const stateName = useLocation<RouteState>().state?.name;
    const history = useHistory();
    const isHost = roomID === 'host';

    const messageHandler = useRef<IMessageHandler>(new MessageHandler());

    const [actualRoomID, setActualRoomID] = useState<string | undefined>();
    const [error, setError] = useState<Error | undefined>();

    const [myName, setMyName] = useState<string>(
        stateName ?? getLocalStorage('name') ?? getRandomName()
    );

    const { players, setPlayers, startGame } = useGameRoom();
    const playersCount = players.length;

    // Setup initial player for host
    useEffect(() => {
        if (isHost) {
            setPlayers([{ name: myName, isHost, peerID: roomManager.peer.id }]);
        }
    }, [isHost, setPlayers, myName]);

    // Setup message handler
    useEffect(() => {
        roomManager.messageHandler = messageHandler.current as MessageHandler;
        return () => (roomManager.messageHandler = undefined);
    }, []);

    // Host message handler
    useEffect(() => {
        if (!isHost) return;

        const handler = messageHandler.current;

        handler.on(MessageType.JOIN_ROOM, (player) => {
            if (players.length < 4) {
                // Inform joiner the success and update name if needed
                const nameExist = players.some(
                    ({ name }) => player.name === name
                );
                const newName = nameExist
                    ? getRandomName(players.map((value) => value.name))
                    : undefined;
                const message = gameRoomActions.joinRoomSuccess({
                    name: player.name,
                    newName,
                });
                roomManager.sendMessage(message, player.peerID);

                // Update players
                const newPlayer: Player = {
                    name: newName ?? player.name,
                    peerID: player.peerID,
                    isHost: false,
                };
                setPlayers((currentPlayers) => [...currentPlayers, newPlayer]);
            } else {
                // Return error if already max player
                roomManager.sendMessage(
                    gameRoomActions.sendError(ErrorMessage.PLAYERS_FULL)
                );
            }
        });
    }, [isHost, players, setPlayers]);

    // Client message handler
    useEffect(() => {
        if (isHost) return;

        const handler = messageHandler.current;

        handler.on(MessageType.JOIN_ROOM_SUCCESS, (payload) => {
            if (myName !== payload.name) return;

            setActualRoomID(roomID);
            if (payload.newName) {
                setMyName(payload.newName);
            }
        });

        handler.on(MessageType.UPDATE_PLAYERS, (players) => {
            setPlayers(players);
        });

        handler.on(MessageType.START_GAME, (payload) => {
            const { player, playerNum, cards, startingPlayerNum } = payload;
            if (player.name !== myName) return;

            // Transition to game screen
            history.push(routeURLs.GAME, {
                playerNum,
                cards,
                isHost,
                startingPlayerNum,
                playersCount,
            });
        });
    }, [isHost, myName, roomID, history, setPlayers, playersCount]);

    // Error message handler
    useEffect(() => {
        const handler = messageHandler.current;

        handler.on(MessageType.ERROR, (error) => {
            switch (error.message) {
                case ErrorMessage.PLAYERS_FULL: {
                    setError(error);
                }
            }
            console.error(error);
        });
    });

    // Host update new player list to everyone
    useEffect(() => {
        if (!isHost) return;

        roomManager.sendMessage(gameRoomActions.updatePlayers(players));
    }, [players, isHost]);

    // Perform connection
    useEffect(() => {
        const action = async () => {
            // Skip if already performed connection
            if (actualRoomID) return;
            try {
                if (isHost) {
                    const newRoomID = await roomManager.createRoom();
                    setActualRoomID(newRoomID);
                } else {
                    await roomManager.joinRoom(roomID);
                    const message = gameRoomActions.joinRoom({
                        name: myName,
                        isHost,
                        peerID: roomManager.peer.id,
                    });
                    roomManager.sendMessage(message);
                }
            } catch (error) {
                setError(error);
            }
        };
        action().catch((error) => console.error(error));
    }, [isHost, roomID, myName, actualRoomID]);

    const copyRoomURL = () => {
        const path = routeURLs.ROOM.replace(':roomID', actualRoomID || '');
        const url = window.location.origin + path;
        navigator.clipboard.writeText(url);
    };

    const renderTitleContent = () => {
        if (actualRoomID) {
            return (
                <>
                    <span>Room: {actualRoomID}</span>
                    <Button onClick={copyRoomURL}>Link</Button>
                </>
            );
        }
        if (error) {
            return `Failed to connect: ${error.message}`;
        }
        return (
            <>
                <span>Connecting</span>
                <CircularProgress size={20} />
            </>
        );
    };

    return (
        <div className={styles.container}>
            <h2 className={styles.title}>{renderTitleContent()}</h2>
            <List className={styles.list_container}>
                {players.map((player) => (
                    <ListItemText
                        key={player.name}
                        primary={
                            <span
                                style={
                                    player.name === myName
                                        ? { fontWeight: 'bold' }
                                        : undefined
                                }
                            >
                                {player.name}
                                {player.isHost ? ' (Host)' : ''}
                            </span>
                        }
                    />
                ))}
            </List>
            {isHost && (
                <div>
                    <Button
                        variant="contained"
                        color="primary"
                        disabled={players.length < 3}
                        onClick={startGame}
                    >
                        Start Game
                    </Button>
                </div>
            )}
        </div>
    );
};

export default GameRoom;
