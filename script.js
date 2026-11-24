/* ==========================================================
   HAIRRY — shared script (product.html / order.html / admin.html)
   Each section runs only if its page's elements exist.
   ========================================================== */

(function () {
  "use strict";

  var ORDER_ENDPOINT =
    "https://script.google.com/macros/s/AKfycbwsingAyEmhY0n83BInx1aGO3vihwV7QJVo97aNcY1b6FoQN7kiAjq25W2StUZtnZMUgA/exec";

  var ORDERS_CSV_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vR_GilCFA1xicXim8e4Pn3Q5gDOxp2knbI8MD5FCmYskfdeh454s7aJq5fM6xuKDvhr9OthkbqkCdg6/pub?gid=0&single=true&output=csv";

  var MOODS = [
    { key: "all", label: "ทั้งหมด" },
    { key: "fresh", label: "Fresh" },
    { key: "sweet", label: "Sweet" },
    { key: "romance", label: "Romance" }
  ];

  /* ---------- Helpers ---------- */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function formatPrice(value) {
    var n = Number(value);
    return isNaN(n) ? String(value) : n.toLocaleString("th-TH") + " บาท";
  }

  function capitalize(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  /* ==========================================================
     1) product.html  —  #filter-bar, #product-list
     ========================================================== */

  function initProductPage() {
    var filterBar = document.getElementById("filter-bar");
    var list = document.getElementById("product-list");
    if (!filterBar || !list) return;

    var products = [];
    var currentMood = "all";

    function validMood(m) {
      return MOODS.some(function (x) { return x.key === m; });
    }

    var paramMood = (new URLSearchParams(window.location.search).get("mood") || "").toLowerCase();
    if (validMood(paramMood)) currentMood = paramMood;

    function renderFilters() {
      filterBar.innerHTML = "";
      MOODS.forEach(function (m) {
        var btn = el("button", "btn btn--small", m.label);
        btn.type = "button";
        btn.dataset.mood = m.key;
        btn.setAttribute("aria-pressed", String(m.key === currentMood));
        if (m.key === currentMood) btn.className = "btn btn--accent btn--small";
        btn.addEventListener("click", function () {
          currentMood = m.key;
          renderFilters();
          renderProducts();
        });
        filterBar.appendChild(btn);
      });
    }

    function buildCard(p) {
      var card = el("article", "product-card");
      card.dataset.mood = p.mood;

      var imgWrap = el("div", "product-card__image");
      var img = el("img");
      img.src = p.image;
      img.alt = p.name;
      img.loading = "lazy";
      imgWrap.appendChild(img);

      var moodRow = el("div", "product-card__mood");
      moodRow.appendChild(el("span", "mood-dot"));
      moodRow.appendChild(el("span", "", capitalize(p.mood)));

      var name = el("h3", "product-card__name", p.name);

      var footer = el("div", "product-card__footer");
      var info = el("div");
      info.appendChild(el("span", "size-tag", p.size));
      info.appendChild(document.createElement("br"));
      info.appendChild(el("span", "price", formatPrice(p.price)));

      var orderUrl =
        "order.html?" +
        new URLSearchParams({ item: p.name, price: String(p.price) }).toString();
      var order = el("a", "btn btn--accent btn--small", "สั่งซื้อ");
      order.href = orderUrl;

      footer.appendChild(info);
      footer.appendChild(order);

      card.appendChild(imgWrap);
      card.appendChild(moodRow);
      card.appendChild(name);
      card.appendChild(footer);
      return card;
    }

    function renderProducts() {
      list.innerHTML = "";
      var shown = products.filter(function (p) {
        return currentMood === "all" || p.mood === currentMood;
      });
      if (!shown.length) {
        list.appendChild(el("p", "", "ไม่พบสินค้าในหมวดนี้"));
        return;
      }
      shown.forEach(function (p) { list.appendChild(buildCard(p)); });
    }

    renderFilters();

    fetch("products.json")
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        products = data;
        renderProducts();
      })
      .catch(function (err) {
        console.error(err);
        list.innerHTML = "";
        list.appendChild(el("p", "", "โหลดรายการสินค้าไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"));
      });
  }

  /* ==========================================================
     2) order.html  —  #orderForm, #customerName, #contact,
                        #items, #total, #note
     ========================================================== */

  function initOrderPage() {
    var form = document.getElementById("orderForm");
    if (!form) return;

    var itemsInput = document.getElementById("items");
    var totalInput = document.getElementById("total");

    // Fill items + total from URL parameters immediately on load
    var params = new URLSearchParams(window.location.search);
    var item = params.get("item");
    var price = params.get("price");
    if (itemsInput && item !== null) itemsInput.value = item;
    if (totalInput && price !== null) totalInput.value = price;

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      var submitBtn = form.querySelector('[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      var payload = {
        customerName: document.getElementById("customerName").value,
        contact: document.getElementById("contact").value,
        items: document.getElementById("items").value,
        total: document.getElementById("total").value,
        note: document.getElementById("note").value
      };

      fetch(ORDER_ENDPOINT, {
        method: "POST",
        body: JSON.stringify(payload)
      })
        .then(function () {
          window.location.href = "thankyou.html";
        })
        .catch(function (error) {
          console.error(error);
          alert("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
          if (submitBtn) submitBtn.disabled = false;
        });
    });
  }

  /* ==========================================================
     3) admin.html  —  #ordersTable tbody
     ========================================================== */

  // Minimal CSV parser: handles quoted fields, commas and line breaks
  // inside quotes, and "" as an escaped quote. No external library.
  function parseCSV(text) {
    var rows = [];
    var row = [];
    var field = "";
    var inQuotes = false;

    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM

    for (var i = 0; i < text.length; i++) {
      var c = text[i];

      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else { inQuotes = false; }
        } else {
          field += c;
        }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field);
        field = "";
        rows.push(row);
        row = [];
      } else {
        field += c;
      }
    }

    // last field / row (file without trailing newline)
    if (field !== "" || row.length) {
      row.push(field);
      rows.push(row);
    }

    return rows.filter(function (r) {
      return r.some(function (cell) { return cell.trim() !== ""; });
    });
  }

  function initAdminPage() {
    var tbody = document.querySelector("#ordersTable tbody");
    if (!tbody) return;

    function showMessage(msg) {
      tbody.innerHTML = "";
      var tr = el("tr");
      var td = el("td", "", msg);
      td.colSpan = 6;
      tr.appendChild(td);
      tbody.appendChild(tr);
    }

    showMessage("กำลังโหลดข้อมูล...");

    fetch(ORDERS_CSV_URL)
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.text();
      })
      .then(function (text) {
        var rows = parseCSV(text);
        rows.shift(); // header row

        if (!rows.length) {
          showMessage("ยังไม่มีคำสั่งซื้อ");
          return;
        }

        // Orders are appended to the sheet over time, so reversing
        // the rows puts the newest order first.
        rows.reverse();

        tbody.innerHTML = "";
        rows.forEach(function (r) {
          var tr = el("tr");
          for (var i = 0; i < 6; i++) {
            var value = r[i] !== undefined ? r[i] : "";
            tr.appendChild(el("td", "", i === 4 && value !== "" && !isNaN(Number(value))
              ? Number(value).toLocaleString("th-TH")
              : value));
          }
          tbody.appendChild(tr);
        });
      })
      .catch(function (err) {
        console.error(err);
        showMessage("โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      });
  }

  /* ---------- Init ---------- */

  document.addEventListener("DOMContentLoaded", function () {
    initProductPage();
    initOrderPage();
    initAdminPage();
  });
})();
