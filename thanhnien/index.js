'use strict';

const cheerio = require('cheerio');
const libingester = require('libingester');
const mustache = require('mustache');
const url = require('url');
const template = require('./template');

const base_uri = 'http://vtv.vn/';
const rss_feed = 'http://thanhnien.vn/rss/home.rss';

// cleaning elements
const clean_elements = [
    'a',
    'div',
    'figure',
    'h2', 'h3',
    'i',
    'p',
    'span',
    'table',
    'td',
    'tr',
    'ul',
];

// delete attr (tag)
const remove_attr = [
    'align',
    'border',
    'bordercolor',
    'cellspacing',
    'cellpadding',
    'class',
    'data-field',
    'data-original',
    'h',
    'height',
    'id',
    'itemscope',
    'itemprop',
    'itemtype',
    'photoid',
    'rel',
    'rules',
    'sizes',
    'style',
    'title',
    'type',
    'w',
    'width',
    'valign',
];

// remove elements (body)
const remove_elements = [
    '.morenews',
    '.sharing-zone',
    '.simplebanner',
    '.small-news',
    '.sprite',
    '.story',
    '.telerik_paste_container',
    '#admbackground-adm',
    '#bs-inread-container',
    'iframe',
    'noscript',
    'script',
    'style',
];

function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($) => {
        const asset = new libingester.NewsArticle();
        const author = $('.details-author').first().text() || $('.meta-author').first().text() || $('.user').first().text();
        const body = $($('.details-content').first()[0] || $('.content').first()[0] || $('.article-content').first()[0]);
        const category = $($('.breadcrumb ul').first()[0] || $('.breadcrumbs').first()[0]);
        const copyright = $('meta[name="copyright"]').attr('content');
        const description = $('meta[property="og:description"]').attr('content');
        const published = $('time').first().text(); // for template
        const modified_time = $('meta[property="article:published_time"]').attr('content').replace(/T/g,' '); // for asset
        const keywords = $('.tags');
        const section = $('meta[property="article:section"]').attr('content');
        const subsection = $('meta[property="article:subsection"]').attr('content');
        const title = $('meta[property="og:title"]').attr('content');

        // article settings
        asset.set_canonical_uri(uri);
        asset.set_last_modified_date(new Date(Date.parse(modified_time)));
        asset.set_license(copyright);
        asset.set_section(`${section}, ${subsection}`);
        asset.set_synopsis(description);
        asset.set_title(title);

        // remove elements and clean tags
        const clean_attr = (tag, a = remove_attr) => a.forEach((attr) => $(tag).removeAttr(attr));
        const clean_tags = (tags) => tags.get().map((t) => clean_attr(t));
        body.find(remove_elements.join(',')).remove();
        clean_tags(body.find(clean_elements.join(',')));
        clean_tags(category.find(clean_elements.join(',')));
        body.find('a').get().map((a) => a.attribs.href = url.resolve(base_uri, a.attribs.href));

        // generating tags
        const categories = cheerio('<div></div>');
        category.find('a').get().map((a) => {
            categories.append(cheerio(`<a href="${url.resolve(base_uri,a.attribs.href)}">${a.attribs.title || $(a).text()}</a>`));
        });
        const tags = cheerio('<div></div>');
        keywords.find('a').get().map((a) => {
            tags.append(cheerio(`<a href="${url.resolve(base_uri,a.attribs.href)}">${a.attribs.title || $(a).text()}</a>`));
        });

        // download images
        let uri_main_image = $('meta[property="og:image"]').attr('content');
        body.find('img').get().map((img) => {
            const src = img.attribs.src;
            clean_attr(img);
            const image = libingester.util.download_img(img);
            image.set_title(title);
            hatch.save_asset(image);
            if ( uri_main_image == src ) {
                uri_main_image = undefined;
                asset.set_thumbnail(image);
            }
        });

        // download main image
        let main_image;
        if (uri_main_image) {
            main_image = libingester.util.download_image(uri_main_image);
            main_image.set_title(title);
            asset.set_thumbnail(main_image);
            hatch.save_asset(main_image);
        }

        const content = mustache.render(template.structure_template, {
            author: author,
            body: body.html(),
            category: categories.html(),
            main_image: main_image,
            published_date: published,
            tags: tags.html(),
            title: title,
        });

        asset.set_document(content);
        hatch.save_asset(asset);
    }).catch((err) => {
        console.log(err);
    });
}

function ingest_video(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($) => {
        const asset = new libingester.VideoAsset();
        const description = $('meta[property="og:description"]').attr('content');
        const dwn = $('#mainplayer script').first().text();
        const download_uri = dwn.substring(dwn.indexOf('http'), dwn.indexOf('mp4')+3);
        const modified_time = $('meta[itemprop="datePublished"]').attr('content').replace(/T/g,' ');
        const title = $('meta[property="og:title"]').attr('content');
        const uri_embed = $('.details-content').find('iframe').attr('src');
        const uri_thumb = $('meta[property="og:image"]').attr('content');

        // download image
        const thumb = libingester.util.download_image(uri_thumb);
        thumb.set_title(title);

        // video settings
        asset.set_canonical_uri(uri);
        asset.set_download_uri(download_uri || uri_embed);
        asset.set_last_modified_date(new Date(Date.parse(modified_time)));
        asset.set_synopsis(description);
        asset.set_thumbnail(thumb);
        asset.set_title(title);

        //save assets
        hatch.save_asset(thumb);
        hatch.save_asset(asset);
    })
}

function main() {
    const hatch = new libingester.Hatch();

    libingester.util.fetch_html(rss_feed).then(($) => {
        const links = $('item').get().map((item) => $(item).find('guid').text());
        Promise.all(
            links.map((uri) => {
                if (uri.includes('/video')) {
                    return ingest_video(hatch, uri);    //ingest video
                } else {
                    return ingest_article(hatch, uri);  //ingest article
                }
            })
        ).then(() => {
            return hatch.finish();
        });
    });
}

main();
