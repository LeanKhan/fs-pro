import { apiUrl } from '../store';
import axios from 'axios';

export default axios.create({
  baseURL: `${apiUrl}/api`,
});
