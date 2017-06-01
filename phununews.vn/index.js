'use strict';

const cheerio = require('cheerio');
const libingester = require('libingester');
const mustache = require('mustache');
const rss2json = require('rss-to-json');
const template = require('./template');
const url = require('url');

const base_uri = 'http://phununews.vn/';
const max_links = 8; // max links per 'rss'
const article_links = [
    'http://phununews.vn/tin-tuc/', // domestic
];

// cleaning elements
const clean_elements = ['a', 'div', 'figure', 'h2', 'i', 'p', 'span', 'ul'];

// delete attr (tag)
const remove_attr = ['class', 'data-field', 'data-original', 'h', 'height', 'id',
    'itemscope', 'itemprop', 'itemtype', 'photoid', 'rel', 'sizes', 'style',
    'title', 'type', 'w', 'width',
];

// remove elements (body)
const remove_elements = ['.author', '.clear', '.clearfix', 'h1', '.icon_box',
    '.gachxanh', '.news-avatar', '.news-info', '.news_keyword', '.tag',
    '.title_detail', 'div[type="RelatedOneNews"]', 'div[type="VideoStream"]',
    'iframe', 'noscript', 'script', 'style',
];

function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($) => {
        const asset = new libingester.NewsArticle();
        const author = $('p.author').text().split('-')[0] || $('.news-info b').text();
        const body = $($('.noidung').first()[0] || $('.infomationdetail').first()[0]);
        const category = $('.submenu_detail .left').first().find('a');
        const copyright = $('meta[name="copyright"]').attr('content');
        const description = $('meta[property="og:description"]').attr('content');
        const published = body.find('.time').first().text().replace('-', '') || $('.published-date').text(); // for template
        const modified_time = $('meta[property="article:modified_time"]').attr('content'); // for asset
        const keywords = $(body.find('.news_keyword').first()[0] || body.find('.tag').first()[0]).clone();
        const section = $('meta[property="article:section"]').attr('content');
        const title = $('meta[property="og:title"]').attr('content');
        const uri_main_image = body.find('.news-avatar').first().attr('src');
        const uri_thumb = $('meta[property="og:image"]').attr('content');

        // article settings
        asset.set_canonical_uri(uri);
        asset.set_last_modified_date(new Date(Date.parse(modified_time)));
        asset.set_license(copyright);
        asset.set_section(section);
        asset.set_synopsis(description);
        asset.set_title(title);

        // main image
        const main_image = libingester.util.download_image(uri_main_image || uri_thumb);
        main_image.set_title(title);
        asset.set_thumbnail(main_image);
        hatch.save_asset(main_image);

        // remove elements and clean tags
        const clean_attr = (tag, a = remove_attr) => a.forEach((attr) => $(tag).removeAttr(attr));
        const clean_tags = (tags) => tags.get().map((t) => clean_attr(t));
        body.find('.tinlienquan').removeAttr('class'); //
        body.find(remove_elements.join(',')).remove();
        clean_tags(body.find(clean_elements.join(',')));
        clean_tags(category.find(clean_elements.join(',')));
        body.find('a').get().map((a) => a.attribs.href = url.resolve(base_uri, a.attribs.href));

        // generating tags
        const categories = cheerio('<div></div>');
        category.get().map((a) => {
            categories.append(cheerio(`<a href="${url.resolve(base_uri,a.attribs.href)}">${a.attribs.title}</a>`));
        });
        const tags = cheerio('<div></div>');
        keywords.find('a').get().map((a) => {
            tags.append(cheerio(`<a href="${url.resolve(base_uri,a.attribs.href)}">${a.attribs.title}</a>`));
        });

        // download images
        body.find('img').get().map((img) => {
            clean_attr(img);
            const image = libingester.util.download_img(img);
            image.set_title(title);
            hatch.save_asset(image);
        });

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
    })
}

function ingest_video(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($) => {
        const asset = new libingester.VideoAsset();
        const body = $('div[itemprop="video"]').first();
        const copyright = $('meta[name="copyright"]').attr('content');
        const description = body.find('meta[itemprop="description"]').attr('content');
        const download_uri = $('.player iframe').first().attr('src');
        const modified_time = body.find('meta[itemprop="uploadDate"]').attr('content');
        const title = body.find('meta[itemprop="name"]').attr('content');
        const uri_thumb = body.find('link[itemprop="thumbnailUrl"]').attr('href');

        // download image
        const thumb = libingester.util.download_image(uri_thumb);
        thumb.set_title(title);

        // video settings
        asset.set_canonical_uri(uri);
        asset.set_download_uri(download_uri);
        asset.set_last_modified_date(new Date(Date.parse(modified_time)));
        asset.set_license(copyright);
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

    const ingest = (uri) => {
        return libingester.util.fetch_html(uri).then(($) => {
            const uris = $('.txt_link').get().map(a => url.resolve(base_uri, a.attribs.href));
            console.log(uris);
        })
    }

    article_links.map(uri => ingest(uri));
}

main();
