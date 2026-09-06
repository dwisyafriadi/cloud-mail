import app from '../hono/hono';
import result from '../model/result';
import publicService from '../service/public-service';

app.post('/public/genToken', async (c) => {
	const data = await publicService.genToken(c, await c.req.json());
	return c.json(result.ok(data));
});

app.post('/public/emailList', async (c) => {
	const list = await publicService.emailList(c, await c.req.json());
	return c.json(result.ok(list));
});

app.post('/public/addUser', async (c) => {
	await publicService.addUser(c, await c.req.json());
	return c.json(result.ok());
});

// v1: dashboard/API-friendly surface
app.get('/public/v1/messages', async (c) => {
	const list = await publicService.emailList(c, c.req.query());
	return c.json(result.ok(list));
});

app.get('/public/v1/messages/:id', async (c) => {
	const data = await publicService.messageDetail(c, c.req.param('id'));
	return c.json(result.ok(data));
});

app.put('/public/v1/messages/read', async (c) => {
	await publicService.markRead(c, await c.req.json());
	return c.json(result.ok());
});

app.get('/public/v1/messages/:id/att/:attId', async (c) => {
	const obj = await publicService.messageAtt(c, c.req.param('id'), c.req.param('attId'));
	if (obj instanceof Response) {
		return obj;
	}
	return new Response(obj.body, {
		headers: {
			'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
			'Content-Disposition': obj.httpMetadata?.contentDisposition || null
		}
	});
});

app.get('/public/v1/addresses', async (c) => {
	const list = await publicService.addressList(c, c.req.query());
	return c.json(result.ok(list));
});

app.post('/public/v1/addresses', async (c) => {
	const data = await publicService.createAddress(c, await c.req.json());
	return c.json(result.ok(data));
});
