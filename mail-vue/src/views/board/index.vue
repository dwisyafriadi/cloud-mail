<template>
  <div class="board">
    <div class="board-bar">
      <el-input v-model="form.prefix" placeholder="prefix (empty = random)" class="w" @keyup.enter="create" />
      <el-select v-model="form.domain" placeholder="domain" class="w">
        <el-option v-for="d in domainList" :key="d" :label="d" :value="d" />
      </el-select>
      <el-button type="primary" :loading="creating" @click="create">New address</el-button>
      <el-input v-model="q" placeholder="filter toEmail" class="w" @keyup.enter="reload" clearable />
      <el-button @click="copyAddr">{{ created || 'copy' }}</el-button>
    </div>
    <emailScroll ref="scroll"
                 :get-emailList="getList"
                 :email-delete="allEmailDelete"
                 :star-add="starAdd"
                 :star-cancel="starCancel"
                 :show-star="false"
                 show-user-info
                 show-status
                 :show-account-icon="false"
                 :time-sort="0"
                 type="all-email"
                 @jump="jump" />
  </div>
</template>

<script setup>
import { reactive, ref, computed, onMounted } from 'vue';
import emailScroll from '@/components/email-scroll/index.vue';
import { boardMessages, boardLatest } from '@/request/board.js';
import { allEmailDelete } from '@/request/all-email.js';
import { starAdd, starCancel } from '@/request/star.js';
import { accountAdd } from '@/request/account.js';
import { useSettingStore } from '@/store/setting.js';
import { useEmailStore } from '@/store/email.js';
import { sleep } from '@/utils/time-utils.js';
import router from '@/router/index.js';
import { useRoute } from 'vue-router';

const settingStore = useSettingStore();
const emailStore = useEmailStore();
const route = useRoute();
const scroll = ref({});
const creating = ref(false);
const created = ref('');
const q = ref('');
const form = reactive({ prefix: '', domain: '' });
const domainList = computed(() => settingStore.domainList || []);
if (!form.domain && domainList.value.length) form.domain = domainList.value[0];

onMounted(() => poll());

function getList(emailId, size) {
  return emailStore.fetchList(full =>
    boardMessages({ emailId, size, full, type: 'receive', accountEmail: q.value || undefined }));
}

function reload() {
  scroll.value.refreshList();
}

async function create() {
  if (creating.value) return;
  creating.value = true;
  try {
    const domain = form.domain || domainList.value[0] || '';
    const prefix = (form.prefix || Math.random().toString(36).slice(2, 12)).toLowerCase();
    const acc = await accountAdd(prefix + domain, undefined);
    created.value = acc.email;
    form.prefix = '';
    reload();
  } finally {
    creating.value = false;
  }
}

async function copyAddr() {
  if (!created.value) return;
  await navigator.clipboard.writeText(created.value);
}

function jump(email) {
  emailStore.contentData.email = emailStore.toContentEmail(email);
  emailStore.contentData.delType = 'physics';
  emailStore.contentData.showStar = false;
  emailStore.contentData.showReply = false;
  router.push({ name: 'content' });
}

async function poll() {
  while (true) {
    await sleep(5000);
    if (route.name !== 'board') continue;
    try {
      const latestId = scroll.value.latestEmail?.emailId;
      if (latestId == null) continue;
      const list = await boardLatest(latestId);
      for (const m of list) {
        scroll.value.addItem(m);
        await sleep(50);
      }
    } catch (e) { console.error(e); }
  }
}
</script>

<style scoped lang="scss">
.board { height: 100%; display: grid; grid-template-rows: auto 1fr; overflow: hidden; }
.board-bar { display: flex; gap: 8px; padding: 8px; flex-wrap: wrap; align-items: center; }
.w { width: 180px; }
</style>
