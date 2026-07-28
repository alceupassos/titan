// Execução de checklist com captura de foto — nível de garantia A1 (T1/navegador) equivalente
// para o app nativo é A3 (docs/adr/0012), mas o hash de conteúdo/envelope é o MESMO formato de
// EvidenceEnvelopeSchema em todos os tiers (packages/contracts/src/housekeeping.ts) — só a
// origem da captura muda. `expo-image-picker` para escolher/tirar a foto, `expo-crypto` (SHA-256
// nativo) para o contentHash sobre os bytes — chamadas reais das APIs, não simuladas.
import { useState } from "react";
import { Alert, Button, StyleSheet, Text, View } from "react-native";
import * as Crypto from "expo-crypto";
import * as ImagePicker from "expo-image-picker";
import { postTaskCompletion } from "../lib/api-client";
import type { EvidenceEnvelope, FieldTask } from "../lib/types";

const APP_VERSION = "0.0.0"; // espelha package.json — Fase 9, sem build EAS real nesta sessão.

async function computeContentHash(base64: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, base64);
}

export function ChecklistScreen({
  task,
  memberId,
  deviceId,
  onDone,
}: {
  task: FieldTask;
  memberId: string;
  deviceId: string;
  onDone: () => void;
}) {
  const [capturedHashes, setCapturedHashes] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  async function captureForItem(itemId: string) {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permissão negada", "A câmera é necessária para registrar a evidência deste item.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7 });
    if (result.canceled || !result.assets[0]?.base64) {
      return;
    }

    const contentHash = await computeContentHash(result.assets[0].base64);
    const envelope: EvidenceEnvelope = {
      contentHash,
      capturedAtEpochMs: Date.now(),
      deviceId,
      appVersion: APP_VERSION,
      taskId: task.taskId,
      checklistItemId: itemId,
      unitId: task.unitId,
      room: itemId,
      geo: null, // sem captura de geolocalização nesta fase — redução de escopo documentada
      referenceShotId: null,
    };
    // O envelope completo seria enviado ao endpoint de captura (fora de escopo desta tela — a
    // Fase 6 já define esse contrato para T1/T2; aqui só o contentHash é o que
    // postTaskCompletion precisa para a trava anti-gaming de produtividade).
    void envelope;

    setCapturedHashes((prev) => ({ ...prev, [itemId]: contentHash }));
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await postTaskCompletion({
        memberId,
        taskId: task.taskId,
        evidenceHashes: Object.values(capturedHashes),
      });
      onDone();
    } catch {
      Alert.alert("Falha ao enviar", "Sem conexão com o servidor — esperado sem backend real nesta sessão.");
    } finally {
      setSubmitting(false);
    }
  }

  const allCaptured = task.checklistItems
    .filter((item) => item.requiresPhoto)
    .every((item) => capturedHashes[item.itemId]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{task.unitName}</Text>
      {task.checklistItems.map((item) => (
        <View key={item.itemId} style={styles.item}>
          <Text style={styles.itemLabel}>{item.label}</Text>
          {item.requiresPhoto ? (
            <Button
              title={capturedHashes[item.itemId] ? "Foto capturada ✓" : "Capturar foto"}
              onPress={() => captureForItem(item.itemId)}
            />
          ) : null}
        </View>
      ))}
      <View style={styles.footer}>
        <Button title="Concluir tarefa" disabled={!allCaptured || submitting} onPress={handleSubmit} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, paddingTop: 48 },
  title: { fontSize: 20, fontWeight: "600", marginBottom: 16 },
  item: { marginBottom: 16, gap: 8 },
  itemLabel: { fontSize: 15 },
  footer: { marginTop: 24 },
});
