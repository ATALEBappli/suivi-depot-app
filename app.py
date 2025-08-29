# =======================
# Imports
# =======================
import streamlit as st
import streamlit.components.v1 as components
import pandas as pd
import gspread
from google.oauth2.service_account import Credentials
from datetime import date

# =======================
# Page config (PREMIÈRE commande Streamlit)
# =======================
st.set_page_config(page_title="Suivi Depot", page_icon="📱", layout="centered")

# =======================
# Patch anti-cache Safari / iOS
# =======================
# 1) Meta headers anti-cache
st.markdown("""
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
<meta http-equiv="Pragma" content="no-cache">
<meta http-equiv="Expires" content="0">
""", unsafe_allow_html=True)

# 2) "Nuke cache" : désenregistre SW, vide CacheStorage/localStorage/sessionStorage/IndexedDB,
# puis recharge avec un paramètre t=timestamp (one-shot par ouverture)
components.html("""
<script>
(async () => {
  try {
    if (window.name !== '__suividepot_cleaned_v3__') {
      window.name = '__suividepot_cleaned_v3__';

      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const r of regs) { try { await r.unregister(); } catch(e){} }
      }

      if (window.caches && caches.keys) {
        const names = await caches.keys();
        await Promise.all(names.map(n => caches.delete(n)));
      }

      try { localStorage.clear(); } catch(e){}
      try { sessionStorage.clear(); } catch(e){}

      if (window.indexedDB) {
        try {
          if (indexedDB.databases) {
            const dbs = await indexedDB.databases();
            for (const db of dbs) {
              if (db && db.name) {
                await new Promise((res) => {
                  const req = indexedDB.deleteDatabase(db.name);
                  req.onblocked = req.onerror = req.onsuccess = () => res();
                });
              }
            }
          }
        } catch(e){}
      }

      const url = new URL(window.location.href);
      url.searchParams.set('t', Date.now().toString());
      window.location.replace(url.toString());
      return;
    }
  } catch(e) { console.log('clean error', e); }
})();
</script>
""", height=0)

# =======================
# Constantes
# =======================
SOUS_BLOCS_ENTREE = ["Locaux", "APP", "Consigne", "Entrées divers"]
SOUS_BLOCS_SORTIE = [
    "Salaire", "Maintenance", "Impôts et assurance",
    "Électricité", "Eau", "Téléphone",
    "Donation, Famille et divers", "Hadem"
]

# =======================
# Accès Google Sheets
# =======================
def _read_secrets():
    if "google_service_account" in st.secrets:
        service_info = dict(st.secrets["google_service_account"])
    elif "gcp_service_account" in st.secrets:
        service_info = dict(st.secrets["gcp_service_account"])
    else:
        st.error("❌ Secret manquant : ajoute [google_service_account] (ou [gcp_service_account]) dans Settings ▸ Secrets.")
        st.stop()

    if "google_sheet" in st.secrets and "sheet_id" in st.secrets["google_sheet"]:
        sheet_id = st.secrets["google_sheet"]["sheet_id"]
    elif "SPREADSHEET_ID" in st.secrets:
        sheet_id = st.secrets["SPREADSHEET_ID"]
    else:
        st.error("❌ Secret manquant : ajoute [google_sheet]\\nsheet_id = \"...\" dans Settings ▸ Secrets.")
        st.stop()
    return service_info, sheet_id

def _open_ws():
    service_info, sheet_id = _read_secrets()
    creds = Credentials.from_service_account_info(
        service_info, scopes=["https://www.googleapis.com/auth/spreadsheets"]
    )
    gc = gspread.authorize(creds)
    sh = gc.open_by_key(sheet_id)
    try:
        ws = sh.worksheet("transactions")
    except gspread.WorksheetNotFound:
        ws = sh.add_worksheet(title="transactions", rows=2000, cols=11)
        ws.append_row([
            "type","date","montant","sous_bloc","description",
            "local","locataire","fournisseur","periode","moyen","personne"
        ])
    return ws

@st.cache_data(ttl=60)
def _get_all_records():
    ws = _open_ws()
    return ws.get_all_records()

def _append_row(row):
    ws = _open_ws()
    ws.append_row(row, value_input_option="USER_ENTERED")

# =======================
# UI
# =======================
st.title("📱 Suivi Depot")
tabs = st.tabs(["📊 Synthèse", "✍️ Saisie"])

# --------- Synthèse ---------
with tabs[0]:
    st.info("Chargement de **Suivi Depot**…")
    try:
        records = _get_all_records()
        df = pd.DataFrame(records)
    except Exception as e:
        st.error(f"❌ Impossible de récupérer les données Google Sheets : {e}")
        st.stop()

    if df.empty:
        st.info("Aucune donnée pour l’instant. Va dans l’onglet **Saisie** pour ajouter la première opération.")
    else:
        df["date"] = pd.to_datetime(df["date"], errors="coerce")
        df["montant"] = pd.to_numeric(df["montant"], errors="coerce")
        df["mois"] = df["date"].dt.strftime("%Y-%m")
        df["montant_signe"] = df.apply(
            lambda r: r["montant"] if r["type"] == "Entrée" else -r["montant"], axis=1
        )

        c1, c2, c3 = st.columns(3)
        with c1:
            mois_sel = st.selectbox("Mois", ["(Tous)"] + sorted(df["mois"].dropna().unique().tolist(), reverse=True))
        with c2:
            type_sel = st.selectbox("Type", ["(Tous)", "Entrée", "Sortie"])
        with c3:
            sb_sel = st.selectbox("Sous-bloc", ["(Tous)"] + sorted(df["sous_bloc"].dropna().unique().tolist()))

        mask = pd.Series(True, index=df.index)
        if mois_sel != "(Tous)":
            mask &= df["mois"].eq(mois_sel)
        if type_sel != "(Tous)":
            mask &= df["type"].eq(type_sel)
        if sb_sel != "(Tous)":
            mask &= df["sous_bloc"].eq(sb_sel)

        dff = df[mask].copy()

        total_in  = dff.loc[dff["type"] == "Entrée", "montant"].sum()
        total_out = dff.loc[dff["type"] == "Sortie", "montant"].sum()
        solde     = dff["montant_signe"].sum()
        n_ops     = len(dff)
        ticket    = dff["montant"].mean() if n_ops else 0

        k1, k2, k3 = st.columns(3)
        k1.metric("Entrées", f"{total_in:,.2f}".replace(",", " "))
        k2.metric("Sorties", f"{total_out:,.2f}".replace(",", " "))
        k3.metric("Solde", f"{solde:,.2f}".replace(",", " "))

        k4, k5 = st.columns(2)
        k4.metric("Nb opérations", n_ops)
        k5.metric("Ticket moyen", f"{ticket:,.2f}".replace(",", " "))

        st.divider()
        st.subheader("Opérations")
        st.dataframe(
            dff.sort_values("date", ascending=False)[[
                "date","type","sous_bloc","montant","description",
                "local","locataire","fournisseur","periode","moyen","personne"
            ]],
            use_container_width=True, hide_index=True
        )

        st.subheader("Évolution mensuelle (solde)")
        by_month = dff.groupby("mois", as_index=False)["montant_signe"].sum().sort_values("mois")
        if not by_month.empty:
            st.bar_chart(by_month.set_index("mois"))

        st.subheader("Répartition par sous-bloc")
        by_sb = dff.groupby(["type","sous_bloc"], as_index=False)["montant"].sum().sort_values(
            ["type","montant"], ascending=[True, False]
        )
        if not by_sb.empty:
            st.bar_chart(by_sb.pivot(index="sous_bloc", columns="type", values="montant").fillna(0))

# --------- Saisie ---------
with tabs[1]:
    st.write("Choisis **Entrée** ou **Sortie**, puis remplis les champs :")
    col0, col1 = st.columns([1, 2])
    with col0:
        t = st.radio("Type", ["Sortie", "Entrée"], horizontal=True)
    with col1:
        sb = st.selectbox("Sous-bloc", SOUS_BLOCS_ENTREE if t == "Entrée" else SOUS_BLOCS_SORTIE)

    d = st.date_input("Date", value=date.today())
    montant = st.number_input("Montant", min_value=0.0, step=0.5, format="%.2f")
    description = st.text_input("Description", placeholder="ex: 1er versement, Paie Août, Facture T1…")

    cA, cB, cC = st.columns(3)
    with cA:
        local = st.text_input("Local (si utile)", placeholder="ex: Cité Peret N7 / Dépôt / APP 20")
    with cB:
        locataire = st.text_input("Locataire (si entrée Locaux)")
    with cC:
        fournisseur = st.text_input("Fournisseur (si sortie charges)")

    cD, cE = st.columns(2)
    with cD:
        periode = st.text_input("Période", value=pd.to_datetime(d).strftime("%Y-%m"))
    with cE:
        moyen = st.selectbox("Moyen", ["CB", "Cash", "Virement", "Chèque", "Autre"])

    personne = st.selectbox("Personne", ["Moi", "Oncle", "Autre"])

    if st.button("Enregistrer", type="primary", use_container_width=True):
        try:
            _append_row([
                t,
                pd.to_datetime(d).strftime("%Y-%m-%d"),
                float(montant),
                sb,
                description,
                local,
                locataire if t == "Entrée" else "",
                fournisseur if t == "Sortie" else "",
                periode,
                moyen,
                personne
            ])
            st.success("✅ Opération enregistrée !")
            st.cache_data.clear()  # pour que la synthèse reflète l’ajout
        except Exception as e:
            st.error(f"❌ Problème lors de l’enregistrement : {e}")
