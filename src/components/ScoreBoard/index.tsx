import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { Card } from '../../models/card';
import styles from './ScoreBoard.module.sass';
import { Button, Divider, Paper } from '@mui/material';
import PlayersScore from './PlayersScore';
import MessageHandler, { IMessageHandler } from '../../utils/messageHandler';
import roomManager from '../../utils/roomManager2';
import { MessageType } from '../../models/message';
import * as scoreBoardActions from '../../actions/scoreBoard';
import useGameRoom from '../Room/useGameRoom';
import routeURLs from '../Routes/urls';
import * as cardUtils from '../../utils/cardUtils';

interface LocationState {
    isHost?: boolean;
    playerNum?: number;
    cards?: Card[];
}

const ScoreBoard: React.FunctionComponent = () => {
    const { playerNum, cards, isHost = false } =
        useLocation<LocationState>().state ?? {};
    const history = useHistory();

    const [allCards, setAllCards] = useState(() => {
        if (playerNum !== undefined && cards) {
            const array: Card[][] = [];
            array[playerNum] = cards;
            return array;
        }
        return [];
    });

    const winnerPlayerNum = useMemo(
        () =>
            allCards
                .map((cards, index) => ({ cards, index }))
                .sort(
                    (v1, v2) =>
                        (v1.cards
                            ? cardUtils.calculateScore(v1.cards)
                            : Number.MAX_SAFE_INTEGER) -
                        (v2.cards
                            ? cardUtils.calculateScore(v2.cards)
                            : Number.MAX_SAFE_INTEGER)
                )[0]?.index,
        [allCards]
    );

    const { players, startGame, totalWins, setTotalWins } = useGameRoom(
        winnerPlayerNum
    );
    const playersCount = players.length;

    const isAllReady = useMemo(
        () => allCards.filter((cards) => cards).length === playersCount,
        [allCards, playersCount]
    );

    const messageHandler = useRef<IMessageHandler>(new MessageHandler());

    // Setup message handler && send initial message.
    useEffect(() => {
        roomManager.messageHandler = messageHandler.current as MessageHandler;
        if (playerNum !== undefined && cards) {
            roomManager.sendMessage(
                scoreBoardActions.calculatePlayerScore({ playerNum, cards })
            );
        }
        return () => (roomManager.messageHandler = undefined);
    }, [playerNum, cards]);

    // Common message handler. Host and client share the same.
    useEffect(() => {
        const handler = messageHandler.current;

        handler.on(MessageType.CALCULATE_PLAYER_SCORE, (payload) => {
            if (payload.playerNum === playerNum) return;
            // Add the cards for calculation and display.
            setAllCards((allCards) => {
                const newCards = [...allCards];
                newCards[payload.playerNum] = payload.cards;
                return newCards;
            });
        });
    }, [isHost, playerNum]);

    // Host message handler
    useEffect(() => {
        if (!isHost || !isAllReady) return;
        // Wait until all cards are available then only inform the clients.
        // Prevent cases where clients haven't reach this page yet.
        allCards.forEach((cards, index) => {
            if (index === playerNum) return; // Ignore for host player num.
            roomManager.sendMessage(
                scoreBoardActions.calculatePlayerScore({
                    playerNum: index,
                    cards,
                })
            );
        });
    }, [allCards, isAllReady, isHost, playerNum]);

    // Client message handler
    useEffect(() => {
        if (isHost) return;

        const handler = messageHandler.current;

        handler.on(MessageType.START_GAME, (payload) => {
            const {
                playerNum: myPlayerNum,
                cards,
                startingPlayerNum,
            } = payload;
            if (myPlayerNum !== playerNum) return;

            // Transition to game screen
            history.push(routeURLs.GAME, {
                playerNum: myPlayerNum,
                cards,
                isHost,
                startingPlayerNum,
                playersCount,
            });
        });
    }, [isHost, history, playerNum, playersCount]);

    // Increase the number of wins for the winner.
    useEffect(() => {
        if (!isAllReady) return;
        setTotalWins((totalWins) => {
            const newTotalWins = [...totalWins];
            newTotalWins[winnerPlayerNum] =
                (newTotalWins[winnerPlayerNum] ?? 0) + 1;
            return newTotalWins;
        });
    }, [winnerPlayerNum, isAllReady, setTotalWins]);

    return (
        <div className={styles.container}>
            <Paper elevation={2} className={styles.content_container}>
                <h1>Score Board</h1>
                <Divider style={{ marginTop: 20, marginBottom: 20 }} />
                <PlayersScore
                    players={players}
                    allCards={allCards}
                    totalWins={totalWins}
                />
                <Divider style={{ marginTop: 20, marginBottom: 20 }} />
                {isHost && (
                    <Button
                        variant="contained"
                        color="primary"
                        fullWidth
                        disabled={!isAllReady}
                        onClick={startGame}
                    >
                        Play Again
                    </Button>
                )}
            </Paper>
        </div>
    );
};

export default ScoreBoard;
