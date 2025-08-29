import streamlit as st
import time
import streamlit.components.v1 as components

st.set_page_config(page_title="Test Safari", page_icon="🧪", layout="centered")

# Anti-cache + cache-busting 1x
st.markdown("""
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
<meta http-equiv="Pragma" content="no-cache">
<meta http-equiv="Expires" content="0">
""", unsafe_allow_html=True)

components.html("""
<script>
  try{
    const url=new URL(window.location.href);
    if(!url.searchParams.get('t')){
      url.searchParams.set('t', Date.now().toString());
      window.location.replace(url.toString());
    }
  }catch(e){console.log('cache-bust error',e)}
</script>
""", height=0)

st.title("🧪 Diagnostic Safari / iPhone")

st.success("Si tu vois **cette page**, le rendu Streamlit fonctionne dans Safari.")

# On affiche quelques infos client via JS
components.html("""
<div id="env"></div>
<script>
 const d = {
   ua: navigator.userAgent,
   standalone: !!window.navigator.standalone,
   width: window.innerWidth, height: window.innerHeight,
   platform: navigator.platform
 };
 document.getElementById('env').innerText = JSON.stringify(d, null, 2);
</script>
""", height=160)

st.write("Appuie sur le bouton ci-dessous pour tester **sans** Google Sheets (juste un spinner).")
if st.button("Test simple"):
    with st.spinner("Petit délai..."):
        time.sleep(1.5)
    st.info("✅ Test simple OK : le front affiche bien quelque chose.")

st.divider()
st.write("Maintenant un test **avec** Google Sheets (si tes secrets sont en place).")

import gspread
from google.oauth2.service_account import Credentials

def try_sheets():
    # Secrets compatibles : [google_service_account] + [google_sheet].sheet_id
    if "google_service_account" not in st.secrets:
        st.error("Manque [google_service_account] dans Secrets.")
        return
    if "google_sheet" not in st.secrets or "sheet_id" not in st.secrets["google_sheet"]:
        st.error("Manque [google_sheet].sheet_id dans Secrets.")
        return
    service_info = dict(st.secrets["google_service_account"])
    sheet_id = st.secrets["google_sheet"]["sheet_id"]
    creds = Credentials.from_service_account_info(service_info, scopes=["https://www.googleapis.com/auth/spreadsheets"])
    gc = gspread.authorize(creds)
    sh = gc.open_by_key(sheet_id)
    st.success(f"✅ Connexion Google Sheets OK : {sh.title}")

if st.button("Tester la connexion Google Sheets"):
    with st.spinner("Connexion..."):
        try:
            try_sheets()
        except Exception as e:
            st.error(f"❌ Erreur Google Sheets : {e}")
