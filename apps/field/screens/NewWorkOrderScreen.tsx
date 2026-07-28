// Abertura de OS técnica com foto — reusa o vocabulário de ServiceType
// (packages/domain/src/housekeeping/checklist.ts) e a FSM de WorkOrderStatus já existente desde a
// Fase 0 (nunca uma FSM paralela — esta tela só CRIA a OS no estado inicial "opened", a transição
// de estado continua sendo decidida por canTransitionWorkOrder no backend).
import { useState } from "react";
import { Alert, Button, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Crypto from "expo-crypto";
import { postWorkOrder } from "../lib/api-client";
import { SERVICE_TYPES, type EvidenceEnvelope, type ServiceType } from "../lib/types";

export function NewWorkOrderScreen({
  unitId,
  onDone,
}: {
  unitId: string;
  onDone: () => void;
}) {
  const [serviceType, setServiceType] = useState<ServiceType>("manutencao_corretiva");
  const [description, setDescription] = useState("");
  const [photoHash, setPhotoHash] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function capturePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permissão negada", "A câmera é necessária para anexar foto à OS.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7 });
    if (result.canceled || !result.assets[0]?.base64) return;
    const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, result.assets[0].base64);
    setPhotoHash(hash);
  }

  async function handleSubmit() {
    if (!description.trim()) {
      Alert.alert("Descrição obrigatória", "Descreva o problema antes de abrir a OS.");
      return;
    }
    setSubmitting(true);
    try {
      const envelope: EvidenceEnvelope | null = photoHash
        ? {
            contentHash: photoHash,
            capturedAtEpochMs: Date.now(),
            deviceId: "field-app",
            appVersion: "0.0.0",
            taskId: "work-order",
            checklistItemId: "work-order-photo",
            unitId,
            room: "n/a",
            geo: null,
            referenceShotId: null,
          }
        : null;
      await postWorkOrder({ unitId, serviceType, description, evidenceEnvelope: envelope });
      onDone();
    } catch {
      Alert.alert("Falha ao enviar", "Sem conexão com o servidor — esperado sem backend real nesta sessão.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Abrir ordem de serviço</Text>

      <Text style={styles.label}>Tipo de serviço</Text>
      <View style={styles.chipRow}>
        {SERVICE_TYPES.map((type) => (
          <Button
            key={type}
            title={type}
            color={type === serviceType ? "#0a7ea4" : undefined}
            onPress={() => setServiceType(type)}
          />
        ))}
      </View>

      <Text style={styles.label}>Descrição</Text>
      <TextInput
        style={styles.input}
        multiline
        value={description}
        onChangeText={setDescription}
        placeholder="Descreva o problema encontrado"
      />

      <Button title={photoHash ? "Foto anexada ✓" : "Anexar foto"} onPress={capturePhoto} />

      <View style={styles.footer}>
        <Button title="Abrir OS" disabled={submitting} onPress={handleSubmit} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingTop: 48, gap: 12 },
  title: { fontSize: 20, fontWeight: "600" },
  label: { fontSize: 13, color: "#666", marginTop: 8 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, minHeight: 80 },
  footer: { marginTop: 24, marginBottom: 48 },
});
