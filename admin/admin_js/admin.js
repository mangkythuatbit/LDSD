document.addEventListener("DOMContentLoaded", function () {
    // Đánh dấu mục sidebar đang mở (bản cũ so "./x.php" với "x.php" nên không bao giờ khớp)
    var currentPath = window.location.pathname.split("/").pop();
    document.querySelectorAll(".sidebar ul li a").forEach(function (link) {
        var target = (link.getAttribute("href") || "").split("/").pop();
        if (target && target !== "#" && target === currentPath) {
            link.parentElement.classList.add("active");
        }
    });
});
