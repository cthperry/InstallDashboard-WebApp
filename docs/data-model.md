# 資料結構（Firestore）

## 1) users/{uid}
```json
{
  "email": "perry_chuang@premtek.com.tw",
  "role": "admin",
  "updatedAt": 1710000000000,
  "createdAt": "<serverTimestamp>"
}
```

## 2) settings/machineModels
```json
{
  "version": "2026-02-28",
  "models": [
    { "code": "FlexTRAK-S", "displayName": "FlexTRAK-S" }
  ],
  "updatedAt": 1710000000000,
  "updatedBy": "someone@premtek.com.tw",
  "updatedAtServer": "<serverTimestamp>"
}
```

## 3) installations/{docId}
```json
{
  "name": "FlexTRAK-S #01",
  "modelCode": "FlexTRAK-S",
  "region": "north",
  "customer": "TSMC F18",
  "phase": "installing",
  "engineer": "Stone",
  "notes": "...",
  "progress": 45,
  "createdAt": 1710000000000,
  "updatedAt": 1710000000000,
  "createdAtServer": "<serverTimestamp>",
  "updatedAtServer": "<serverTimestamp>"
}
```

## 4) auditLogs/{docId}
```json
{
  "action": "新增",
  "target": "FlexTRAK-S #01",
  "detail": "新增至北區 — TSMC F18",
  "actorEmail": "perry_chuang@premtek.com.tw",
  "createdAt": "<serverTimestamp>"
}
```

## 5) events/{docId}
```json
{
  "eventName": "installation_create",
  "payload": { "name": "...", "phase": "ordered" },
  "createdAt": "<serverTimestamp>"
}
```


## 6) equipments/{docId}
```json
{
  "equipmentId": "EQ-N-001",
  "region": "north",
  "customer": "客戶A",
  "site": "竹科Fab1",
  "modelCode": "FlexTRAK-S",
  "serialNo": "P160623",
  "statusMain": "裝機",
  "statusSub": "配管配線",
  "owner": "PM-Allen",

  "milestones": {
    "installStart": "2026-02-10",
    "installDone": "",
    "trialStart": "",
    "trialPass": "",
    "prodStart": "",
    "reachTargetDate": "2026-03-15"
  },

  "blocking": {
    "reasonCode": "料件未到",
    "detail": "真空閥件缺料，等待到貨",
    "owner": "SCM-Judy",
    "eta": "2026-03-01"
  },

  "capacity": {
    "utilization": 62,
    "uph": 120,
    "targetUph": 150,
    "level": "黃",
    "trend7d": [40,55,60,58,62,64,62]
  },

  "createdAt": 1710000000000,
  "updatedAt": 1710000000000
}
```
