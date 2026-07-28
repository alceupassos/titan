// Lista de tarefas do dia — primeira tela do ciclo (ver App.tsx para a navegação simplificada por
// estado, sem expo-router: decisão de escopo desta fase, documentada em App.tsx). Chamada real de
// fetch contra a API (lib/api-client.ts) — sem emulador nesta sessão, o estado de erro é o
// caminho esperado, tratado explicitamente (nunca uma tela em branco sem explicação).
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { fetchFieldTasks, FieldApiError } from "../lib/api-client";
import type { FieldTask } from "../lib/types";

export function TasksListScreen({ onSelectTask }: { onSelectTask: (task: FieldTask) => void }) {
  const [tasks, setTasks] = useState<FieldTask[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchFieldTasks()
      .then((result) => {
        if (!cancelled) setTasks(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof FieldApiError ? err.message : "Falha ao carregar tarefas do dia.";
        setError(message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Tarefas do dia</Text>
        <Text style={styles.error}>{error}</Text>
        <Text style={styles.hint}>Sem conexão com o servidor — esperado sem backend real nesta sessão.</Text>
      </View>
    );
  }

  if (!tasks) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tarefas do dia</Text>
      <FlatList
        data={tasks}
        keyExtractor={(task) => task.taskId}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => onSelectTask(item)}>
            <Text style={styles.rowTitle}>{item.unitName}</Text>
            <Text style={styles.rowSubtitle}>{item.checklistItems.length} itens de checklist</Text>
          </Pressable>
        )}
        ListEmptyComponent={<Text style={styles.hint}>Nenhuma tarefa atribuída hoje.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, paddingTop: 48 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16 },
  title: { fontSize: 20, fontWeight: "600", marginBottom: 12 },
  row: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#e5e5e5" },
  rowTitle: { fontSize: 16, fontWeight: "500" },
  rowSubtitle: { fontSize: 13, color: "#666" },
  error: { color: "#b91c1c", textAlign: "center", marginTop: 8 },
  hint: { color: "#666", textAlign: "center", marginTop: 8, fontSize: 12 },
});
