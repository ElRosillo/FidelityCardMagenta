# Fidelidad · Estudio de uñas

Aplicación web minimalista para crear tarjetas de fidelidad, registrar visitas con QR y consultar los registros de clientas.

## Ejecutar localmente

```bash
python3 -m http.server 4173
```

Después, abre `http://localhost:4173`.

## Persistencia

La versión actual guarda los datos en `localStorage` del navegador, por lo que funciona sin servidor. El modelo relacional equivalente para migrar a SQLite, PostgreSQL o Supabase está en [database.sql](database.sql).

Cada tarjeta genera un Client ID único y un token de check-in distinto. El QR almacena únicamente el payload de check-in; la aplicación solo lo acepta dentro de la pantalla de registro de visita y requiere confirmación del personal antes de incrementar el contador.
