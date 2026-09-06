import http from '@/axios/index.js';

export function boardMessages(params) {
    return http.get('/allEmail/list', { params: { ...params } });
}

export function boardLatest(emailId) {
    return http.get('/allEmail/latest', { params: { emailId }, noMsg: true, timeout: 35 * 1000 });
}
