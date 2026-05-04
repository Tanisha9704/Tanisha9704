export function GameTable() {
  return (
    <group>
      {/* Round table top */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <cylinderGeometry args={[3.6, 3.6, 0.2, 64]} />
        <meshStandardMaterial color="#0d3a2c" roughness={0.92} metalness={0.05} />
      </mesh>
      {/* Felt accent ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.105, 0]}>
        <ringGeometry args={[3.45, 3.6, 64]} />
        <meshStandardMaterial color="#1a5a45" emissive="#0a4030" emissiveIntensity={0.2} />
      </mesh>
      {/* Floor */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.2, 0]}>
        <circleGeometry args={[12, 64]} />
        <meshStandardMaterial color="#0a0a0a" roughness={0.6} metalness={0.3} />
      </mesh>
    </group>
  );
}
