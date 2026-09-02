import { Manager } from 'socket.io-client';
import { apiUrl } from './api';

const manager = new Manager(apiUrl, { autoConnect: false });

export const appSocket = manager.socket('/');
