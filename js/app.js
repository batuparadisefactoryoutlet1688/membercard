/******************************************************************
 * PROJECT      : Paradise Member
 * MODULE       : Generate Member Card (Frontend - GitHub, Repo Terpisah)
 * FILE         : js/app.js
 * VERSION      : v1.1.0
 * AUTHOR       : Jimmy
 * CREATED      : 2026-09-25
 * LAST UPDATE  : 2026-09-25
 *
 * DESCRIPTION
 * ----------------------------------------------------------------
 * Mengambil daftar member dari Apps Script API (action=getMembers),
 * menampilkannya sebagai pencarian (datalist), menggambar kartu
 * member di atas template assets/membercard.png memakai <canvas>
 * (Nama, Valid From, Valid Until, Member Code), menyediakan tombol
 * download hasilnya sebagai file PNG, dan tombol Refresh untuk
 * memuat ulang data member terbaru dari spreadsheet.
 ******************************************************************/

/******************************************************************
 * VERSION HISTORY
 * ----------------------------------------------------------------
 *
 * v1.0.0
 * - Initial Release.
 *
 * v1.1.0
 * - Menambahkan handleRefreshClick(), resetSelectionState(), dan
 *   setRefreshing() untuk tombol Refresh Data Member. Data yang
 *   sudah dimuat (variable memberList) disimpan di memory browser
 *   saat halaman dibuka, sehingga pendaftaran baru tidak otomatis
 *   muncul sampai tombol Refresh ditekan.
 *
 ******************************************************************/

/******************************************************************
 * DEPENDENCIES
 * ----------------------------------------------------------------
 *
 * Required
 * - index.html (elemen form & canvas)
 * - Apps Script Web App (Code.gs, action=getMembers)
 * - assets/membercard.png
 *
 ******************************************************************/

(function () {

  /******************************************************************
   * CONFIGURATION
   * ----------------------------------------------------------------
   * API_URL sudah diisi dengan URL Web App Apps Script Paradise
   * Member. Kalau nanti Apps Script di-deploy ulang (New deployment)
   * dan URL-nya berubah, ganti nilai di bawah ini.
   ******************************************************************/
  const CONFIG = {
    API_URL: "https://script.google.com/macros/s/AKfycbwraZPdIdTPoQzzNZnL4o_Avs0-ynNxKHzrQ-u13j0Pcl-QKoESBXfNwQqj0BsJzHSUbg/exec",
    CARD_IMAGE_PATH: "assets/membercard.png"
  };

  /******************************************************************
   * CONSTANTS
   * ----------------------------------------------------------------
   * Ukuran kartu dan posisi (titik tengah) tiap elemen teks, sesuai
   * ukuran desain membercard.png (1671 x 941 px).
   ******************************************************************/
  const ACTION_GET_MEMBERS = "getMembers";

  const CARD_WIDTH = 1671;
  const CARD_HEIGHT = 941;

  const NAME_CENTER_X = 834.00;
  const NAME_CENTER_Y = 535.50;
  const NAME_MAX_WIDTH = 1674;
  const NAME_BOX_HEIGHT = 77;
  const NAME_BACKGROUND_PADDING_RATIO = 0.10;

  const INFO_BOX_WIDTH = 322;
  const INFO_BOX_HEIGHT = 77;
  const VALID_FROM_CENTER_X = 390.00;
  const VALID_FROM_CENTER_Y = 794.50;
  const VALID_UNTIL_CENTER_X = 840.00;
  const VALID_UNTIL_CENTER_Y = 794.50;
  const MEMBER_CODE_CENTER_X = 1304.00;
  const MEMBER_CODE_CENTER_Y = 794.50;

  const VALID_UNTIL_YEAR_OFFSET = 1;

  const FONT_FAMILY = "Arial, Helvetica, sans-serif";
  const NAME_FONT_SIZE_INITIAL = 48;
  const NAME_FONT_SIZE_MIN = 20;
  const INFO_FONT_SIZE_INITIAL = 32;
  const INFO_FONT_SIZE_MIN = 16;
  const FONT_SIZE_STEP = 1;
  const TEXT_HORIZONTAL_PADDING = 16;

  const COLOR_TEXT = "#000000";
  const COLOR_BACKGROUND = "#FFFFFF";

  const MONTH_NAMES_SHORT_ID = [
    "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
    "Jul", "Agu", "Sep", "Okt", "Nov", "Des"
  ];

  const DOWNLOAD_FILENAME_PREFIX = "MemberCard-";
  const REFRESH_BUTTON_LABEL_DEFAULT = "⟳ Refresh Data Member";
  const REFRESH_BUTTON_LABEL_LOADING = "Memuat...";

  /******************************************************************
   * STATE
   * ----------------------------------------------------------------
   * Data member yang sudah dimuat dari API, dan referensi canvas.
   ******************************************************************/
  let memberList = [];
  let canvasElement = null;
  let canvasContext = null;
  let cardImageElement = null;

  document.addEventListener("DOMContentLoaded", initializePage);

  /******************************************************************
   * Function : initializePage()
   * Tujuan   : Menyiapkan canvas, memuat gambar template kartu, dan
   *            memuat daftar member dari API saat halaman dibuka.
   ******************************************************************/
  function initializePage() {
    canvasElement = document.getElementById("memberCardCanvas");
    canvasContext = canvasElement.getContext("2d");

    document.getElementById("memberSearchInput").addEventListener("input", handleSearchInput);
    document.getElementById("generateButton").addEventListener("click", handleGenerateClick);
    document.getElementById("downloadButton").addEventListener("click", handleDownloadClick);
    document.getElementById("refreshButton").addEventListener("click", handleRefreshClick);

    preloadCardImage();
    loadMemberList();
  }

  /******************************************************************
   * Function : preloadCardImage()
   * Tujuan   : Memuat gambar template membercard.png lebih awal
   *            supaya saat tombol Generate ditekan, gambar sudah
   *            siap dipakai tanpa jeda.
   ******************************************************************/
  function preloadCardImage() {
    cardImageElement = new Image();
    cardImageElement.src = CONFIG.CARD_IMAGE_PATH;
  }

  /******************************************************************
   * Function : loadMemberList()
   * Tujuan   : Mengambil seluruh data member dari Apps Script API
   *            (action=getMembers) dan mengisi datalist pencarian.
   ******************************************************************/
  function loadMemberList() {
    setRefreshing(true);
    showStatus("Memuat data member...", false);

    const requestUrl = CONFIG.API_URL + "?action=" + ACTION_GET_MEMBERS;

    fetch(requestUrl)
      .then(function (response) {
        return response.json();
      })
      .then(function (result) {
        setRefreshing(false);

        if (!result.success) {
          showStatus(result.message, true);
          return;
        }

        memberList = result.data;
        populateMemberDataList(memberList);
        showStatus("Data member siap. Total: " + memberList.length + " member.", false);
      })
      .catch(function (error) {
        setRefreshing(false);
        showStatus("Gagal memuat data member. Periksa koneksi atau API_URL.", true);
        console.error("[LOAD MEMBERS]", error);
      });
  }

  /******************************************************************
   * Function : populateMemberDataList()
   * Tujuan   : Mengisi elemen <datalist> dengan opsi "MEMBER_ID -
   *            Nama" dari seluruh member, supaya bisa dicari lewat
   *            nama ATAU Member ID di satu kolom yang sama.
   ******************************************************************/
  function populateMemberDataList(members) {
    const dataListElement = document.getElementById("memberDataList");
    dataListElement.innerHTML = "";

    for (let i = 0; i < members.length; i++) {
      const optionElement = document.createElement("option");
      optionElement.value = buildMemberOptionLabel(members[i]);
      dataListElement.appendChild(optionElement);
    }
  }

  /******************************************************************
   * Function : buildMemberOptionLabel()
   * Tujuan   : Membentuk teks label "MEMBER_ID - Nama" yang dipakai
   *            sebagai opsi pencarian maupun kunci pencocokan.
   ******************************************************************/
  function buildMemberOptionLabel(member) {
    return member.memberId + " - " + member.namaLengkap;
  }

  /******************************************************************
   * Function : handleSearchInput()
   * Tujuan   : Mengaktifkan tombol Generate hanya jika teks di
   *            kolom pencarian cocok PERSIS dengan salah satu
   *            member (dipilih dari datalist atau diketik lengkap).
   ******************************************************************/
  function handleSearchInput(event) {
    const matchedMember = findMemberByOptionLabel(event.target.value);
    const generateButton = document.getElementById("generateButton");

    generateButton.disabled = !matchedMember;
    document.getElementById("downloadButton").classList.add("hidden");
  }

  /******************************************************************
   * Function : findMemberByOptionLabel()
   * Tujuan   : Mencari data member berdasarkan teks label "MEMBER_ID
   *            - Nama" yang sedang ada di kolom pencarian.
   ******************************************************************/
  function findMemberByOptionLabel(optionLabel) {
    for (let i = 0; i < memberList.length; i++) {
      if (buildMemberOptionLabel(memberList[i]) === optionLabel) {
        return memberList[i];
      }
    }

    return null;
  }

  /******************************************************************
   * Function : handleGenerateClick()
   * Tujuan   : Menggambar kartu member terpilih ke canvas.
   ******************************************************************/
  function handleGenerateClick() {
    const searchInputValue = document.getElementById("memberSearchInput").value;
    const selectedMember = findMemberByOptionLabel(searchInputValue);

    if (!selectedMember) {
      showStatus("Member tidak ditemukan. Pilih dari daftar pencarian.", true);
      return;
    }

    drawMemberCard(selectedMember);
  }

  /******************************************************************
   * Function : drawMemberCard()
   * Tujuan   : Menggambar ulang template kartu, lalu menimpanya
   *            dengan kotak putih + teks hitam untuk Nama, Valid
   *            From, Valid Until, dan Member Code.
   ******************************************************************/
  function drawMemberCard(member) {
    canvasContext.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
    canvasContext.drawImage(cardImageElement, 0, 0, CARD_WIDTH, CARD_HEIGHT);

    const validFromDate = parseDateText(member.tanggalDaftar);
    const validUntilDate = addYearsToDate(validFromDate, VALID_UNTIL_YEAR_OFFSET);

    drawDynamicNameField(member.namaLengkap);
    drawFixedInfoField(formatDateIndonesian(validFromDate), VALID_FROM_CENTER_X, VALID_FROM_CENTER_Y);
    drawFixedInfoField(formatDateIndonesian(validUntilDate), VALID_UNTIL_CENTER_X, VALID_UNTIL_CENTER_Y);
    drawFixedInfoField(member.memberId, MEMBER_CODE_CENTER_X, MEMBER_CODE_CENTER_Y);

    showStatus("Kartu berhasil dibuat untuk " + member.namaLengkap + ".", false);
    document.getElementById("downloadButton").classList.remove("hidden");
  }

  /******************************************************************
   * Function : drawDynamicNameField()
   * Tujuan   : Menggambar field Nama dengan lebar background putih
   *            MENGIKUTI panjang teks aktual (+10% kiri, +10%
   *            kanan), bukan kotak tetap 1674x77. Tinggi background
   *            tetap mengikuti NAME_BOX_HEIGHT.
   ******************************************************************/
  function drawDynamicNameField(nameText) {
    const maxTextWidth = NAME_MAX_WIDTH / (1 + (2 * NAME_BACKGROUND_PADDING_RATIO));

    const fittedFontSize = fitTextFontSize(
      nameText,
      maxTextWidth,
      NAME_FONT_SIZE_INITIAL,
      NAME_FONT_SIZE_MIN,
      true
    );

    canvasContext.font = buildFontString(fittedFontSize, true);
    const textWidth = canvasContext.measureText(nameText).width;
    const backgroundWidth = textWidth * (1 + (2 * NAME_BACKGROUND_PADDING_RATIO));

    drawWhiteBackground(NAME_CENTER_X, NAME_CENTER_Y, backgroundWidth, NAME_BOX_HEIGHT);
    drawCenteredText(nameText, NAME_CENTER_X, NAME_CENTER_Y, fittedFontSize, true);
  }

  /******************************************************************
   * Function : drawFixedInfoField()
   * Tujuan   : Menggambar field Valid From / Valid Until / Member
   *            Code dengan kotak background putih TETAP
   *            (322 x 77), teks otomatis mengecil kalau terlalu
   *            panjang supaya tetap muat di dalam kotak.
   ******************************************************************/
  function drawFixedInfoField(text, centerX, centerY) {
    const maxTextWidth = INFO_BOX_WIDTH - (TEXT_HORIZONTAL_PADDING * 2);

    const fittedFontSize = fitTextFontSize(
      text,
      maxTextWidth,
      INFO_FONT_SIZE_INITIAL,
      INFO_FONT_SIZE_MIN,
      false
    );

    drawWhiteBackground(centerX, centerY, INFO_BOX_WIDTH, INFO_BOX_HEIGHT);
    drawCenteredText(text, centerX, centerY, fittedFontSize, false);
  }

  /******************************************************************
   * Function : fitTextFontSize()
   * Tujuan   : Mencari ukuran font terbesar (mulai dari
   *            initialFontSize, turun sampai minFontSize) yang
   *            membuat teks tetap muat di dalam maxWidth.
   ******************************************************************/
  function fitTextFontSize(text, maxWidth, initialFontSize, minFontSize, isBold) {
    let currentFontSize = initialFontSize;

    while (currentFontSize > minFontSize) {
      canvasContext.font = buildFontString(currentFontSize, isBold);
      const textWidth = canvasContext.measureText(text).width;

      if (textWidth <= maxWidth) {
        return currentFontSize;
      }

      currentFontSize -= FONT_SIZE_STEP;
    }

    return minFontSize;
  }

  /******************************************************************
   * Function : buildFontString()
   * Tujuan   : Membentuk string font CSS Canvas, contoh:
   *            "bold 48px Arial, Helvetica, sans-serif"
   ******************************************************************/
  function buildFontString(fontSize, isBold) {
    const weightText = isBold ? "bold " : "";
    return weightText + fontSize + "px " + FONT_FAMILY;
  }

  /******************************************************************
   * Function : drawWhiteBackground()
   * Tujuan   : Menggambar kotak putih di canvas, berpusat pada
   *            titik (centerX, centerY) dengan ukuran width x
   *            height yang diberikan.
   ******************************************************************/
  function drawWhiteBackground(centerX, centerY, width, height) {
    canvasContext.fillStyle = COLOR_BACKGROUND;
    canvasContext.fillRect(centerX - (width / 2), centerY - (height / 2), width, height);
  }

  /******************************************************************
   * Function : drawCenteredText()
   * Tujuan   : Menggambar teks hitam, rata tengah horizontal &
   *            vertikal, pada titik (centerX, centerY).
   ******************************************************************/
  function drawCenteredText(text, centerX, centerY, fontSize, isBold) {
    canvasContext.font = buildFontString(fontSize, isBold);
    canvasContext.fillStyle = COLOR_TEXT;
    canvasContext.textAlign = "center";
    canvasContext.textBaseline = "middle";
    canvasContext.fillText(text, centerX, centerY);
  }

  /******************************************************************
   * Function : parseDateText()
   * Tujuan   : Mengubah teks tanggal format yyyy-MM-dd menjadi
   *            objek Date.
   ******************************************************************/
  function parseDateText(dateText) {
    const dateParts = dateText.split("-");
    const year = Number(dateParts[0]);
    const month = Number(dateParts[1]) - 1;
    const day = Number(dateParts[2]);

    return new Date(year, month, day);
  }

  /******************************************************************
   * Function : addYearsToDate()
   * Tujuan   : Menambahkan sejumlah tahun ke sebuah tanggal,
   *            dipakai untuk menghitung Valid Until (Valid From +
   *            1 tahun).
   ******************************************************************/
  function addYearsToDate(date, yearsToAdd) {
    const newDate = new Date(date.getTime());
    newDate.setFullYear(newDate.getFullYear() + yearsToAdd);
    return newDate;
  }

  /******************************************************************
   * Function : formatDateIndonesian()
   * Tujuan   : Memformat objek Date menjadi teks "25 Sep 2026".
   ******************************************************************/
  function formatDateIndonesian(date) {
    const day = date.getDate();
    const monthName = MONTH_NAMES_SHORT_ID[date.getMonth()];
    const year = date.getFullYear();

    return day + " " + monthName + " " + year;
  }

  /******************************************************************
   * Function : handleDownloadClick()
   * Tujuan   : Mengunduh isi canvas sebagai file PNG, dengan nama
   *            file berdasarkan Member ID yang sedang ditampilkan.
   ******************************************************************/
  function handleDownloadClick() {
    const searchInputValue = document.getElementById("memberSearchInput").value;
    const selectedMember = findMemberByOptionLabel(searchInputValue);
    const fileName = DOWNLOAD_FILENAME_PREFIX + (selectedMember ? selectedMember.memberId : "member") + ".png";

    const downloadLinkElement = document.createElement("a");
    downloadLinkElement.download = fileName;
    downloadLinkElement.href = canvasElement.toDataURL("image/png");
    downloadLinkElement.click();
  }

  /******************************************************************
   * Function : showStatus()
   * Tujuan   : Menampilkan pesan status di bawah kolom pencarian.
   ******************************************************************/
  function showStatus(message, isError) {
    const statusElement = document.getElementById("statusMessage");
    statusElement.textContent = message;
    statusElement.className = isError ? "status-message error" : "status-message success";
  }

  /******************************************************************
   * Function : handleRefreshClick()
   * Tujuan   : Dipicu saat tombol Refresh Data Member ditekan.
   *            Data member yang sudah dimuat (memory browser) bisa
   *            jadi tidak lagi mewakili data terbaru di spreadsheet
   *            (misal ada pendaftaran baru setelah halaman dibuka),
   *            jadi fungsi ini memuat ulang dari Apps Script dan
   *            mengosongkan pilihan/kartu yang sedang ditampilkan.
   ******************************************************************/
  function handleRefreshClick() {
    resetSelectionState();
    loadMemberList();
  }

  /******************************************************************
   * Function : resetSelectionState()
   * Tujuan   : Mengosongkan kolom pencarian dan menyembunyikan
   *            kartu/tombol download, supaya tidak ada kartu lama
   *            yang masih tampil setelah data di-refresh.
   ******************************************************************/
  function resetSelectionState() {
    document.getElementById("memberSearchInput").value = "";
    document.getElementById("generateButton").disabled = true;
    document.getElementById("downloadButton").classList.add("hidden");
  }

  /******************************************************************
   * Function : setRefreshing()
   * Tujuan   : Mengatur tampilan tombol Refresh selagi proses
   *            pemuatan data berjalan, mencegah klik ganda.
   ******************************************************************/
  function setRefreshing(isRefreshing) {
    const refreshButtonElement = document.getElementById("refreshButton");
    refreshButtonElement.disabled = isRefreshing;
    refreshButtonElement.textContent = isRefreshing ? REFRESH_BUTTON_LABEL_LOADING : REFRESH_BUTTON_LABEL_DEFAULT;
  }

})();
