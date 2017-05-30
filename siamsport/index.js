'use strict';

const libingester = require('libingester');
const mustache = require('mustache');
const template = require('./template');
const url = require('url');

const base_uri = 'http://www.siamsport.co.th/';
const uri_article = 'http://www.siamsport.co.th/More_News.asp';
const uri_gallery = 'http://www.siamsport.co.th/SiamsportPhoto/index.php';
const uri_video = 'http://sstv.siamsport.co.th/top_hits.php';

// clean images
const remove_attr = ['class', 'style'];

// Remove elements (body)
const remove_elements = ['#ssinread', 'iframe', 'script', 'style'];

// copyright warning
const remove_copyright = ['Getty Images', 'mirror.com', 'Siamsport', '"บอ.บู๋"'];

// embed video
const video_iframes = ['sstv.siamsport.co.th'];

// render
const render_template = (hatch, asset, template, post_data) => {
    const content = mustache.render(template, post_data);
    asset.set_document(content);
    hatch.save_asset(asset);
}

const get_body = ($) => {
    let b = $('.newsdetail').first()[0] ||
        $('.txtdetails').first()[0] ||
        $('.newsde-text').first()[0];
    return $(b);
}

const get_date = ($) => {
    let d = $('.titlenews .black13').text() ||
        $('.newsde-title .black11').text() ||
        $('.toptitle2 .black13t').text() ||
        $('.date-time').text();
    return d.replace(/[\s\S]*(\d{2,}\/\d+\/\d+)\s(\d+:\d+:\d+)[\s\S]*/, "$1 $2");
}

const get_description = ($) => {
    let d = $('meta[property="og:description"]').attr('content') ||
        $('meta[name="description"]').attr('content') ||
        $('meta[name="Description"]').attr('content') || '';
    return d.replace(/[\t\n]/g, '');
}

const get_keywords = ($) => {
    let k = $('meta[name="keywords"]').attr('content') ||
        $('meta[name="KeyWords"]').attr('content') ||
        $('meta[name="Keywords"]').attr('content');
    return k || "";
}

const get_last_modified_date = (date) => {
    let modified_date;
    const c = date,
        d = c.substring(0, 10),
        a = d.substring(0, 2),
        b = d.substring(3, 5);
    const format_date = d.replace(b, a).replace(a, b);
    if (modified_date = Date.parse(format_date)) {
        modified_date = new Date(modified_date);
    } else {
        modified_date = new Date();
    }
    return modified_date;
}

const get_title = ($) => {
    let t = $('meta[property="og:title"]').attr('content') ||
        $('title').text();
    return t.replace(/[\t\n]/g, '');
}


function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($) => {
        const asset = new libingester.NewsArticle();
        const body = get_body($);
        const keywords = get_keywords($);
        const description = get_description($);
        const modified_time = get_date($);
        const title = get_title($);
        const uri_main_image = $('meta[property="og:image"]').attr('content');

        if (!title) return; // Some links return "File Not Found !"

        // Article Settings
        asset.set_canonical_uri(uri);
        asset.set_section(keywords);
        asset.set_synopsis(description);
        asset.set_title(title);

        // main image
        const main_image = libingester.util.download_image(uri_main_image);
        main_image.set_title(title);
        asset.set_thumbnail(main_image);
        hatch.save_asset(main_image);

        // set last modified date
        const modified_date = get_last_modified_date(modified_time);
        asset.set_last_modified_date(modified_date);

        // remove elements and comments
        body.contents().filter((index, node) => node.type === 'comment').remove();
        for (const element of remove_elements) {
            body.find(element).remove();
        }

        // clean attribs (body)
        body.contents().filter((index, node) => node.type !== 'text').map(function() {
            for (const attr of remove_attr) {
                $(this).removeAttr(attr);
            }
        });
        body.find('span').removeAttr('style');

        // remove copyright warning
        const warning = body.find('strong').last();
        for (const w of remove_copyright) {
            if (warning.text() == w) {
                $(warning).parent().parent().remove();
                break;
            }
        }

        // download images
        body.find('img').get().map((img) => {
            const image = libingester.util.download_image(img.attribs.src);
            image.set_title(title);
            img.attribs["data-libingester-asset-id"] = image.asset_id;
            hatch.save_asset(image);
            for (const attr of remove_attr) {
                $(img).removeAttr(attr);
            }
        });

        render_template(hatch, asset, template.structure_template, {
            body: body.html(),
            category: keywords,
            main_image: main_image,
            published: modified_time,
            title: title,
        });
    }).catch((err) => {
        return ingest_article(hatch, uri);
    });
}

function ingest_gallery(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($) => {
        const asset = new libingester.NewsArticle();
        const title = $('.font-pink18').first().text();

        // Article Settings
        asset.set_canonical_uri(uri);
        asset.set_section('Gallery');
        asset.set_title(title);

        // set last modified Date
        let data = $('.font-pink11').first().parent().text();
        const regex = /[\s\S]*(\d{2,}\/\d+)\/(\d{2})[\s\S]*(\d{2,}:\d{2,})[\s\S]*/;
        const date = data.replace(regex, "$1/20$2 $3:00");
        asset.set_last_modified_date(get_last_modified_date(date));

        // get all image links
        let image_links = $('a[rel="exgroup"]').get().map((a) => {
            return url.resolve(uri_gallery, a.attribs.href);
        });
        image_links.shift(); //remove repeat link

        // download images
        let images = [];
        for (const src of image_links) {
            const image = libingester.util.download_image(src);
            image.set_title(title);
            hatch.save_asset(image);
            images.push({ image: image });
        }
        asset.set_thumbnail(images[images.length - 1].image);

        render_template(hatch, asset, template.template_gallery, {
            gallery: images,
            published: date,
            title: title,
        });
    }).catch((err) => {
        return ingest_gallery(hatch, uri);
    });
}

function ingest_video(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($) => {
        const description = get_description($);
        const keywords = get_keywords($);
        const modified_time = get_date($);
        const thumb_url = $('meta[property="og:image"]').attr('content');
        const title = get_title($);
        const video_url = $('.embed-container').find('iframe').attr('src') || '';

        for (const domain of video_iframes) {
            if (video_url.includes(domain)) {
                const thumbnail = libingester.util.download_image(thumb_url);
                thumbnail.set_title(title);
                hatch.save_asset(thumbnail);

                const video = new libingester.VideoAsset();
                video.set_canonical_uri(uri);
                video.set_download_uri(video_url);
                video.set_last_modified_date(get_last_modified_date(modified_time));
                video.set_synopsis(description);
                video.set_thumbnail(thumbnail);
                video.set_title(title);
                hatch.save_asset(video);
            }
        }
    }).catch((err) => {
        return ingest_video(hatch, uri);
    });
}

function main() {
    const hatch = new libingester.Hatch();

    const article = libingester.util.fetch_html(uri_article).then(($) =>
        Promise.all(
            $('tr[valign="top"] td a').get().map((a) => {
                return libingester.util.fetch_html(a.attribs.href).then(($) => {
                    const u = $('META').attr('content'),
                        link = u.substring(u.indexOf('http'));
                    const uri = link.includes('siamsport.co.th') ? link : a.attribs.href;
                    return ingest_article(hatch, uri);
                })
            })
        )
    );

    const gallery = libingester.util.fetch_html(uri_gallery).then(($) => {
        const links = $('.pink18-link').get().map((a) => url.resolve(uri_gallery, a.attribs.href));
        return Promise.all(links.map((uri) => ingest_gallery(hatch, uri)));
    });

    const video = libingester.util.fetch_html(uri_video).then(($) => {
        const links = $('.top-pic a').get().map((a) => url.resolve(uri_video, a.attribs.href));
        return Promise.all(links.map((uri) => ingest_video(hatch, uri)));
    });

    Promise.all([article, gallery, video]).then(() => {
        return hatch.finish();
    });
}

main();