// Navegação por estado local (useState), sem expo-router — decisão de escopo desta fase:
// configurar Expo Router (babel/entry point) sob Expo 57 (versão muito recente, sem docs/exemplos
// maduros no momento desta sessão — ver AGENTS.md deste pacote) introduziria risco de
// configuração que não pode ser verificado sem emulador/dispositivo real nesta máquina. As 3 telas
// do ciclo (lista de tarefas → checklist → nova OS, esta última acessível a partir do contexto de
// uma unidade específica) são suficientes para o portão de saída da Fase 9 ("ciclo completo de
// estadia executado no app"), provado no nível de contrato de API
// (packages/domain/src/workforce/*.test.ts + Passo 5 desta fase), nunca visto rodando num
// dispositivo real.
import { useState } from "react";
import { Button, SafeAreaView, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { TasksListScreen } from "./screens/TasksListScreen";
import { ChecklistScreen } from "./screens/ChecklistScreen";
import { NewWorkOrderScreen } from "./screens/NewWorkOrderScreen";
import type { FieldTask } from "./lib/types";

// Amostra até o app ganhar tela de login real (fora de escopo desta fase — sem backend de
// autenticação de app nativo configurado nesta sessão).
const SAMPLE_MEMBER_ID = "a0000000-0000-4000-8000-000000000010";
const DEVICE_ID = "field-device-sample";

type Screen =
  | { kind: "tasks" }
  | { kind: "checklist"; task: FieldTask }
  | { kind: "new-work-order"; unitId: string };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ kind: "tasks" });

  return (
    <SafeAreaView style={styles.safeArea}>
      {screen.kind === "tasks" ? (
        <TasksListScreen onSelectTask={(task) => setScreen({ kind: "checklist", task })} />
      ) : screen.kind === "checklist" ? (
        <View style={styles.flex}>
          <ChecklistScreen
            task={screen.task}
            memberId={SAMPLE_MEMBER_ID}
            deviceId={DEVICE_ID}
            onDone={() => setScreen({ kind: "tasks" })}
          />
          <View style={styles.footer}>
            <Button
              title="Abrir OS para esta unidade"
              onPress={() => setScreen({ kind: "new-work-order", unitId: screen.task.unitId })}
            />
          </View>
        </View>
      ) : (
        <NewWorkOrderScreen unitId={screen.unitId} onDone={() => setScreen({ kind: "tasks" })} />
      )}
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  flex: { flex: 1 },
  footer: { padding: 16 },
});
