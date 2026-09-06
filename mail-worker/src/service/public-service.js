import BizError from '../error/biz-error';
import orm from '../entity/orm';
import { v4 as uuidv4 } from 'uuid';
import { and, asc, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import saltHashUtils from '../utils/crypto-utils';
import cryptoUtils from '../utils/crypto-utils';
import emailUtils from '../utils/email-utils';
import roleService from './role-service';
import verifyUtils from '../utils/verify-utils';
import { t } from '../i18n/i18n';
import reqUtils from '../utils/req-utils';
import dayjs from 'dayjs';
import { isDel, roleConst, emailConst } from '../const/entity-const';
import email from '../entity/email';
import account from '../entity/account';
import { att } from '../entity/att';
import userService from './user-service';
import accountService from './account-service';
import attService from './att-service';
import settingService from './setting-service';
import r2Service from './r2-service';
import KvConst from '../const/kv-const';

// ponytail: no per-key scoping/quota, single global PUBLIC_KEY; add when shared beyond personal use
const publicService = {

	async emailList(c, params) {

		let { toEmail, content, subject, sendName, sendEmail, timeSort, num, size, type , isDel, unread, code, accountId, after } = params

		const query = orm(c).select({
				emailId: email.emailId,
				sendEmail: email.sendEmail,
				sendName: email.name,
				subject: email.subject,
				toEmail: email.toEmail,
				toName: email.toName,
				type: email.type,
				createTime: email.createTime,
				content: email.content,
				text: email.text,
				isDel: email.isDel,
				unread: email.unread,
				code: email.code,
		}).from(email)

		if (!size) {
			size = 20
		}

		if (!num) {
			num = 1
		}

		size = Number(size);
		num = Number(num);

		if (size > 50) {
			size = 50;
		}

		num = (num - 1) * size;

		let conditions = []

		if (toEmail) {
			conditions.push(sql`${email.toEmail} COLLATE NOCASE LIKE ${toEmail}`)
		}

		if (sendEmail) {
			conditions.push(sql`${email.sendEmail} COLLATE NOCASE LIKE ${sendEmail}`)
		}

		if (sendName) {
			conditions.push(sql`${email.name} COLLATE NOCASE LIKE ${sendName}`)
		}

		if (subject) {
			conditions.push(sql`${email.subject} COLLATE NOCASE LIKE ${subject}`)
		}

		if (content) {
			conditions.push(sql`${email.content} COLLATE NOCASE LIKE ${content}`)
		}

		if (type || type === 0) {
			conditions.push(eq(email.type, type))
		}

		if (isDel || isDel === 0) {
			conditions.push(eq(email.isDel, isDel))
		}

		if (unread == 0 || unread == 1) {
			conditions.push(eq(email.unread, Number(unread)))
		}

		if (code) {
			conditions.push(eq(email.code, code))
		}

		if (accountId) {
			conditions.push(eq(email.accountId, Number(accountId)))
		}

		if (after) {
			conditions.push(gt(email.emailId, Number(after)))
		}

		if (conditions.length === 1) {
			query.where(...conditions)
		} else if (conditions.length > 1) {
			query.where(and(...conditions))
		}

		if (timeSort === 'asc') {
			query.orderBy(asc(email.emailId));
		} else {
			query.orderBy(desc(email.emailId));
		}

		return query.limit(size).offset(num);

	},

	async messageDetail(c, emailId) {
		const row = await orm(c).select().from(email).where(eq(email.emailId, Number(emailId))).get();
		if (!row) {
			throw new BizError(t('notExist'));
		}
		const attList = await attService.selectByEmailIds(c, [row.emailId]);
		return { ...row, attList };
	},

	async messageAtt(c, emailId, attId) {
		const row = await orm(c).select().from(att).where(
			and(eq(att.emailId, Number(emailId)), eq(att.attId, Number(attId)))
		).get();
		if (!row) {
			throw new BizError(t('notExist'));
		}
		return r2Service.getObj(c, row.key);
	},

	async markRead(c, params) {
		const ids = String(params.emailIds || '').split(',').map(Number).filter(Boolean);
		if (!ids.length) {
			return;
		}
		await orm(c).update(email).set({ unread: emailConst.unread.READ }).where(inArray(email.emailId, ids)).run();
	},

	async createAddress(c, params) {
		let { prefix, domain, name } = params;

		let domains = c.env.domain;
		if (typeof domains === 'string') {
			domains = JSON.parse(domains);
		}

		domain = domain || domains[0];

		if (!domains.includes(domain)) {
			throw new BizError(t('notEmailDomain'));
		}

		prefix = String(prefix || randomPrefix()).toLowerCase().replace(/[^a-z0-9._-]/g, '');

		if (!prefix) {
			prefix = randomPrefix();
		}

		const emailAddr = `${prefix}@${domain}`;

		if (!verifyUtils.isEmail(emailAddr)) {
			throw new BizError(t('notEmail'));
		}

		if (emailUtils.getName(emailAddr).length > 64) {
			throw new BizError(t('emailLengthLimit'));
		}

		const { minEmailPrefix, emailPrefixFilter } = await settingService.query(c);

		if (emailUtils.getName(emailAddr).length < minEmailPrefix) {
			throw new BizError(t('minEmailPrefix', { msg: minEmailPrefix }));
		}

		if (emailPrefixFilter.some(content => emailUtils.getName(emailAddr).includes(content))) {
			throw new BizError(t('banEmailPrefix'));
		}

		const dup = await accountService.selectByEmailIncludeDel(c, emailAddr);

		if (dup) {
			throw new BizError(t('emailExistDatabase'));
		}

		const roleList = await roleService.roleSelectUse(c);
		const defRole = roleList.find(roleRow => roleRow.isDefault === roleConst.isDefault.OPEN);

		const { salt, hash } = await saltHashUtils.hashPassword(cryptoUtils.genRandomPwd());
		const activeIp = reqUtils.getIp(c);
		const { os, browser, device } = reqUtils.getUserAgent(c);
		const activeTime = dayjs().format('YYYY-MM-DD HH:mm:ss');

		const userId = await userService.insert(c, {
			email: emailAddr, password: hash, salt, type: defRole.roleId,
			os, browser, device, activeIp, createIp: activeIp, activeTime, createTime: activeTime
		});

		const accountRow = await orm(c).insert(account).values({
			email: emailAddr, userId, name: name || emailUtils.getName(emailAddr)
		}).returning().get();

		await userService.updateUserInfo(c, userId, true);

		return { email: emailAddr, accountId: accountRow.accountId, userId };
	},

	addressList(c, params) {
		let { size, after } = params;
		size = Number(size) || 20;
		if (size > 50) {
			size = 50;
		}
		const conditions = [eq(account.isDel, isDel.NORMAL)];
		if (Number(after)) {
			conditions.push(gt(account.accountId, Number(after)));
		}
		return orm(c).select({
			accountId: account.accountId,
			email: account.email,
			name: account.name,
			createTime: account.createTime
		}).from(account).where(and(...conditions)).orderBy(desc(account.accountId)).limit(size).all();
	},

	async addUser(c, params) {
		const { list } = params;

		if (!list || list.length === 0) return;

		const roleList = await roleService.roleSelectUse(c);
		const defRole = roleList.find(roleRow => roleRow.isDefault === roleConst.isDefault.OPEN);

		const activeIp = reqUtils.getIp(c);
		const { os, browser, device } = reqUtils.getUserAgent(c);
		const activeTime = dayjs().format('YYYY-MM-DD HH:mm:ss');

		const rows = [];

		for (const emailRow of list) {
			if (!verifyUtils.isEmail(emailRow.email)) {
				throw new BizError(t('notEmail'));
			}

			if (!c.env.domain.includes(emailUtils.getDomain(emailRow.email))) {
				throw new BizError(t('notEmailDomain'));
			}

			const dup = await accountService.selectByEmailIncludeDel(c, emailRow.email);
			if (dup) {
				throw new BizError(t('emailExistDatabase'));
			}

			let type = defRole.roleId;

			if (emailRow.roleName) {
				const roleRow = roleList.find(role => role.name === emailRow.roleName);
				type = roleRow ? roleRow.roleId : type;
			}

			const { salt, hash } = await saltHashUtils.hashPassword(
				emailRow.password || cryptoUtils.genRandomPwd()
			);

			rows.push({
				email: emailRow.email, password: hash, salt, type,
				os, browser, device, activeIp, createIp: activeIp, activeTime, createTime: activeTime
			});
		}

		try {
			for (const row of rows) {
				const userId = await userService.insert(c, row);
				await accountService.insert(c, { email: row.email, userId, name: emailUtils.getName(row.email) });
			}
		} catch (e) {
			if (e.message && e.message.includes('SQLITE_CONSTRAINT')) {
				throw new BizError(t('emailExistDatabase'))
			} else {
				throw e
			}
		}

	},

	async genToken(c, params) {

		await this.verifyUser(c, params)

		const uuid = uuidv4();

		await c.env.kv.put(KvConst.PUBLIC_KEY, uuid);

		return {token: uuid}
	},

	async verifyUser(c, params) {

		const { email, password } = params

		const userRow = await userService.selectByEmailIncludeDel(c, email);

		if (email !== c.env.admin) {
			throw new BizError(t('notAdmin'));
		}

		if (!userRow || userRow.isDel === isDel.DELETE) {
			throw new BizError(t('notExistUser'));
		}

		if (!await cryptoUtils.verifyPassword(password, userRow.salt, userRow.password)) {
			throw new BizError(t('IncorrectPwd'));
		}
	}

}

function randomPrefix(n = 10) {
	const buf = new Uint8Array(n);
	crypto.getRandomValues(buf);
	return Array.from(buf, b => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
}

export default publicService
